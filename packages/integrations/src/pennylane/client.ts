import { z } from "zod";
import { withCancellation } from "../cancellation";
import { IntegrationError } from "../errors";
import { normalizedInvoiceSchema, type NormalizedInvoice } from "../invoicing";
const ORIGIN = 'https://app.pennylane.com';
const ROOT = '/api/external/v2';
const MAX_BYTES = 5 * 1024 * 1024;
const id = z.number().int().safe().positive();
const summarySchema = z.object({
  id, draft: z.boolean(), status: z.string(), credited_invoice: z.object({ id }).nullable()
});
const invoiceSchema = summarySchema.extend({
  invoice_number: z.string(), currency: z.literal('EUR'), currency_amount: z.string(), currency_amount_before_tax: z.string(), currency_tax: z.string(),
  date: z.string(), deadline: z.string(), paid: z.boolean(), remaining_amount_with_tax: z.string().nullable(),
  customer: z.object({ id }), status: z.enum(['paid', 'partially_paid', 'upcoming', 'late', 'cancelled']),
});
const pageSchema = z.object({
  items: z.array(z.unknown()).max(100), has_more: z.boolean(), next_cursor: z.string().min(1).max(4096).nullable()
});
const customerSchema = z.object({ id, name: z.string().trim().min(1).max(500) });
const invalid = () => new IntegrationError('PROVIDER_INVALID_RESPONSE');
const unavailable = () => new IntegrationError('PROVIDER_UNAVAILABLE');
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw invalid();
  return result.data;
}
function cents(value: string): number {
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(value))
    throw invalid();
  const [whole, decimal = ''] = value.split('.');
  const amount = BigInt(whole!) * 100n + BigInt(decimal.padEnd(2, '0'));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw invalid();
  return Number(amount);
}
export type CreatePennylaneProviderOptions = {
  token: string;
  fetch?: typeof globalThis.fetch;
};
export type PennylaneInvoiceSnapshot = {
  invoices: NormalizedInvoice[];
  skippedDrafts: number;
  skippedCreditNotes: number;
};
/** Server entry-point export only. Read scopes: customer_invoices:readonly, customers:readonly. */
export function createPennylaneProvider(options: CreatePennylaneProviderOptions) {
  const token = options.token.trim();
  if (!token || token.length > 4096 || /[\r\n]/.test(token))
    throw new IntegrationError('PROVIDER_AUTH_EXPIRED');
  const fetcher = options.fetch ?? globalThis.fetch;
  async function request(path: string, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      return await withCancellation(async () => {
        const response = await fetcher(`${ORIGIN}${ROOT}${path}`, {
          method: 'GET', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: combined
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => {
          });
          throw new IntegrationError(response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH_EXPIRED' : response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE');
        }
        if (Number(response.headers.get('content-length')) > MAX_BYTES) {
          void response.body?.cancel().catch(() => {
          });
          throw invalid();
        }
        if (!response.body)
          throw invalid();
        const reader = response.body.getReader();
        const cancel = () => {
          void reader.cancel().catch(() => {
          });
        };
        combined.addEventListener('abort', cancel, { once: true });
        let size = 0;
        let text = '';
        const decoder = new TextDecoder('utf-8', { fatal: true });
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done)
              break;
            size += chunk.value.byteLength;
            if (size > MAX_BYTES)
              throw invalid();
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
          return JSON.parse(text) as unknown;
        }
        catch (error) {
          if (error instanceof IntegrationError)
            throw error;
          throw invalid();
        }
        finally {
          combined.removeEventListener('abort', cancel);
          cancel();
        }
      }, combined, unavailable);
    }
    catch (error) {
      if (error instanceof IntegrationError)
        throw error;
      throw unavailable();
    }
    finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return { async readInvoices(signal?: AbortSignal): Promise<PennylaneInvoiceSnapshot> {
      const total = new AbortController();
      const timer = setTimeout(() => total.abort(), 120000);
      const combined = signal ? AbortSignal.any([signal, total.signal]) : total.signal;
      try {
        const result: PennylaneInvoiceSnapshot = {
          invoices: [], skippedDrafts: 0, skippedCreditNotes: 0
        };
        const customers = new Map<number, {
          externalId: string;
          name: string;
        }>();
        const ids = new Set<number>();
        const cursors = new Set<string>();
        let cursor: string | null = null;
        for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
          const query = new URLSearchParams({ limit: '100' });
          if (cursor)
            query.set('cursor', cursor);
          const page = parse(pageSchema, await request(`/customer_invoices?${query}`, combined));
          for (const raw of page.items) {
            const summary = parse(summarySchema, raw);
            if (ids.has(summary.id))
              throw invalid();
            ids.add(summary.id);
            if (summary.draft || summary.status === 'draft') {
              result.skippedDrafts++;
              continue;
            }
            if (summary.status === 'credit_note' || summary.credited_invoice !== null) {
              result.skippedCreditNotes++;
              continue;
            }
            const source = parse(invoiceSchema, raw);
            const amountTtcCents = cents(source.currency_amount);
            const amountHtCents = cents(source.currency_amount_before_tax);
            const amountVatCents = cents(source.currency_tax);
            const remaining = source.remaining_amount_with_tax === null ? null : cents(source.remaining_amount_with_tax);
            if (remaining === null && !source.paid)
              throw invalid();
            if (remaining !== null && (remaining > amountTtcCents || (source.paid && remaining !== 0)))
              throw invalid();
            if (source.paid !== (source.status === 'paid'))
              throw invalid();
            let customer = customers.get(source.customer.id);
            if (!customer) {
              const record = parse(customerSchema, await request(`/customers/${source.customer.id}`, combined));
              if (record.id !== source.customer.id)
                throw invalid();
              customer = { externalId: String(record.id), name: record.name };
              customers.set(record.id, customer);
            }
            // Remaining receivable is provider settlement knowledge; it does not establish a bank payment date.
            const paid = source.paid ? amountTtcCents : remaining === null ? null : amountTtcCents - remaining;
            const status = source.status === 'cancelled' ? 'cancelled' : source.paid ? 'paid' : paid !== null && paid > 0 ? 'partially_paid' : source.status === 'partially_paid' ? 'partially_paid' : source.status === 'late' ? 'overdue' : 'issued';
            result.invoices.push(parse(normalizedInvoiceSchema, {
              externalId: String(source.id), customer, invoiceNumber: source.invoice_number, issuedAt: source.date, dueAt: source.deadline, amountHtCents, amountVatCents, amountTtcCents, currency: 'EUR', status, payment: paid === null ? { kind: 'unknown' } : {
                kind: 'known', paidAmountCents: paid, paidAt: null
              }
            }));
          }
          if (!page.has_more) {
            if (page.next_cursor !== null)
              throw invalid();
            return result;
          }
          if (page.next_cursor === null || cursors.has(page.next_cursor))
            throw invalid();
          cursors.add(page.next_cursor);
          cursor = page.next_cursor;
        }
        throw invalid();
      }
      finally {
        clearTimeout(timer);
        total.abort();
      }
    } };
}
