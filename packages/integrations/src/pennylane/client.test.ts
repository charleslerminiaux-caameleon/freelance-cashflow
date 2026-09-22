import { describe, expect, it, vi } from "vitest";
import { createPennylaneProvider } from "./client";
const invoice = (extra = {}) => ({
  id: 1, invoice_number: "F1", currency: "EUR", currency_amount: "120.30", currency_amount_before_tax: "100.25", currency_tax: "20.05", date: "2026-01-01", deadline: "2026-02-01", paid: false, status: "partially_paid", remaining_amount_with_tax: "20.10", draft: false, credited_invoice: null, customer: { id: 42, url: "https://evil.test/secret" }, ...extra
});
const page = (items: unknown[], extra = {}) => ({
  items, has_more: false, next_cursor: null, ...extra
});
const response = (body: unknown) => new Response(JSON.stringify(body));
function setup(pages: unknown[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => String(url).includes('/customers/') ? response({ id: 42, name: "Customer" }) : response(pages.shift()));
  return { fetch, provider: createPennylaneProvider({ token: "secret", fetch }) };
}
describe('Pennylane read-only adapter', () => {
  it('normalizes exact cents, looks up customer on fixed host, and never invents a payment date', async () => {
    const { provider, fetch } = setup([page([invoice()])]);
    expect(await provider.readInvoices()).toEqual({
      invoices: [{
          externalId: "1", customer: { externalId: "42", name: "Customer" }, invoiceNumber: "F1", issuedAt: "2026-01-01", dueAt: "2026-02-01", amountHtCents: 10025, amountVatCents: 2005, amountTtcCents: 12030, currency: "EUR", status: "partially_paid", payment: {
            kind: "known", paidAmountCents: 10020, paidAt: null
          }
        }], skippedDrafts: 0, skippedCreditNotes: 0
    });
    expect(fetch.mock.calls[1]?.[0]).toBe('https://app.pennylane.com/api/external/v2/customers/42');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer secret' }
    });
  });
  it('paginates, caches customers and counts drafts/credit notes', async () => {
    const { provider, fetch } = setup([page([invoice(), {
          id: 2, draft: true, status: 'draft', credited_invoice: null
        }], { has_more: true, next_cursor: 'opaque & token' }), page([invoice({ id: 3 }), {
          id: 4, draft: false, status: 'credit_note', credited_invoice: { id: 1 }
        }])]);
    expect(await provider.readInvoices()).toMatchObject({
      invoices: [{ externalId: '1' }, { externalId: '3' }], skippedDrafts: 1, skippedCreditNotes: 1
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(fetch.mock.calls[2]?.[0])).toContain('cursor=opaque+%26+token');
  });
  it.each([{ currency: 'USD' }, { currency_amount: '120.301' }, { currency_tax: '20.06' }, { remaining_amount_with_tax: '130' }, { date: null }, { deadline: '2026-02-30' }, { status: 'partially_cancelled' }, { paid: true }, { customer: null }])('rejects unsupported or inconsistent invoice %j', async (extra) => {
    const { provider } = setup([page([invoice(extra)])]);
    await expect(provider.readInvoices()).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
  });
  it('rejects unknown settlement when remaining is null', async () => {
    const { provider } = setup([page([invoice({ remaining_amount_with_tax: null })])]);
    await expect(provider.readInvoices()).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
  });
  it('paid flag establishes full settlement without date', async () => {
    const { provider } = setup([page([invoice({
          paid: true, status: 'paid', remaining_amount_with_tax: null
        })])]);
    expect((await provider.readInvoices()).invoices[0]?.payment).toEqual({
      kind: 'known', paidAmountCents: 12030, paidAt: null
    });
  });
  it('rejects cursor loops and duplicate invoice identities', async () => {
    for (const pages of [[page([], { has_more: true, next_cursor: 'x' }), page([], { has_more: true, next_cursor: 'x' })], [page([invoice(), invoice()])]]) {
      await expect(setup(pages).provider.readInvoices()).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
    }
  });
  it.each([401, 403, 429, 500])('sanitizes HTTP %i', async (status) => {
    const provider = createPennylaneProvider({ token: 'secret', fetch: vi.fn(async () => new Response('secret', { status })) });
    await expect(provider.readInvoices()).rejects.toMatchObject({ code: status === 429 ? 'PROVIDER_RATE_LIMIT' : status === 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_AUTH_EXPIRED' });
  });
  it('sanitizes transport errors', async () => {
    const provider = createPennylaneProvider({ token: 'secret', fetch: vi.fn(async () => {
        throw Error('secret');
      }) });
    await expect(provider.readInvoices()).rejects.toThrow('The provider is temporarily unavailable.');
  });
  it('cancels non-cooperative transport', async () => {
    const controller = new AbortController();
    const provider = createPennylaneProvider({ token: 'secret', fetch: vi.fn(() => new Promise<Response>(() => {
      })) });
    const pending = provider.readInvoices(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
  it('bounds response bodies', async () => {
    const provider = createPennylaneProvider({ token: 'secret', fetch: vi.fn(async () => new Response('x', { headers: { 'content-length': '99999999' } })) });
    await expect(provider.readInvoices()).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
  });
});
