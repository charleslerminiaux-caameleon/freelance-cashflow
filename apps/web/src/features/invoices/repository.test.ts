import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate, moneyCents } from "@fc/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RepositoryError } from "../repository-error";
import {
  createInvoice,
  importInvoiceRows,
  listInvoices,
  recordInvoicePayment,
} from "./repository";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const invoiceId = "33333333-3333-4333-8333-333333333333";

type QueryResult = { data: unknown; error: unknown };

function query(result: QueryResult) {
  const chain = {
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    order: vi.fn(),
    select: vi.fn(),
    then: (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  for (const method of [chain.eq, chain.in, chain.order, chain.select]) {
    method.mockReturnValue(chain);
  }

  return chain;
}

function clientWith(input: {
  customers?: QueryResult;
  invoices?: QueryResult;
  schedules?: QueryResult;
  payments?: QueryResult;
  rpc?: ReturnType<typeof vi.fn>;
}) {
  const queries = {
    customers: query(input.customers ?? { data: [], error: null }),
    invoices: query(input.invoices ?? { data: [], error: null }),
    billing_schedule_items: query(input.schedules ?? { data: [], error: null }),
    invoice_payments: query(input.payments ?? { data: [], error: null }),
  };
  const from = vi.fn((table: keyof typeof queries) => queries[table]);
  const rpc = input.rpc ?? vi.fn().mockResolvedValue({ data: invoiceId, error: null });

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    queries,
    rpc,
  };
}

const manualInvoice = {
  invoiceNumber: "F-2026-001",
  customerId,
  billingScheduleItemId: null,
  issuedAt: localDate("2026-09-01"),
  dueAt: localDate("2026-09-30"),
  expectedPaymentDate: localDate("2026-09-30"),
  amountHtCents: moneyCents(100_000),
  vatCents: moneyCents(20_000),
  amountTtcCents: moneyCents(120_000),
};

const csvRow = {
  invoiceNumber: "F-CSV-001",
  customerName: "Atelier Bleu",
  issuedAt: localDate("2026-09-01"),
  dueAt: localDate("2026-09-30"),
  amountHtCents: moneyCents(100_000),
  vatCents: moneyCents(20_000),
  amountTtcCents: moneyCents(120_000),
  rawPayloadHash: "6ae702f20e8b15ad8ad434980accdb7cffb3ed31e290c6f086ea14971a8c195f",
};

beforeEach(() => {
  vi.clearAllMocks();
});

it("scopes the invoice list to the authenticated owner", async () => {
  const { client, queries } = clientWith({ invoices: { data: [], error: null } });

  await listInvoices(client, ownerUserId);

  expect(queries.invoices.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
});

it("checks customer ownership before creating a manual invoice through the RPC", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: invoiceId, error: null });
  const { client, queries } = clientWith({
    customers: { data: { id: customerId }, error: null },
    rpc,
  });

  await expect(createInvoice(client, ownerUserId, manualInvoice)).resolves.toBe(invoiceId);
  expect(queries.customers.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
  expect(rpc).toHaveBeenCalledWith("create_invoice", {
    p_amount_ht_cents: 100_000,
    p_amount_ttc_cents: 120_000,
    p_billing_schedule_item_id: null,
    p_customer_id: customerId,
    p_due_at: "2026-09-30",
    p_expected_payment_date: "2026-09-30",
    p_invoice_number: "F-2026-001",
    p_issued_at: "2026-09-01",
    p_provider: "manual",
    p_raw_payload_hash: null,
    p_vat_cents: 20_000,
  });
});

it("does not call the invoice RPC for a customer outside the owner scope", async () => {
  const rpc = vi.fn();
  const { client } = clientWith({ customers: { data: null, error: null }, rpc });

  await expect(createInvoice(client, ownerUserId, manualInvoice)).rejects.toEqual(
    new RepositoryError("FC_CUSTOMER_NOT_FOUND"),
  );
  expect(rpc).not.toHaveBeenCalled();
});

describe("importInvoiceRows", () => {
  it("returns an unchanged idempotent result for the same persisted invoice", async () => {
    const { client, rpc } = clientWith({
      customers: { data: [{ id: customerId, name: "Atelier Bleu" }], error: null },
      invoices: {
        data: [
          {
            id: invoiceId,
            customer_id: customerId,
            billing_schedule_item_id: null,
            provider: "csv",
            invoice_number: "F-CSV-001",
            issued_at: "2026-09-01",
            due_at: "2026-09-30",
            expected_payment_date: "2026-09-30",
            amount_ht_cents: 100_000,
            vat_cents: 20_000,
            amount_ttc_cents: 120_000,
            raw_payload_hash: csvRow.rawPayloadHash,
          },
        ],
        error: null,
      },
    });

    await expect(importInvoiceRows(client, ownerUserId, [csvRow])).resolves.toEqual({
      createdCount: 0,
      unchangedCount: 1,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects every conflicting number before writing any import row", async () => {
    const rpc = vi.fn();
    const { client } = clientWith({
      customers: { data: [{ id: customerId, name: "Atelier Bleu" }], error: null },
      invoices: {
        data: [
          {
            id: invoiceId,
            customer_id: customerId,
            billing_schedule_item_id: null,
            provider: "csv",
            invoice_number: "F-CSV-001",
            issued_at: "2026-09-01",
            due_at: "2026-09-30",
            expected_payment_date: "2026-09-30",
            amount_ht_cents: 100_001,
            vat_cents: 20_000,
            amount_ttc_cents: 120_001,
            raw_payload_hash: "b".repeat(64),
          },
        ],
        error: null,
      },
      rpc,
    });

    await expect(importInvoiceRows(client, ownerUserId, [csvRow])).rejects.toEqual(
      new RepositoryError("FC_INVOICE_NUMBER_CONFLICT"),
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects unknown and ambiguous customer names before querying invoice writes", async () => {
    const rpc = vi.fn();
    const missing = clientWith({ customers: { data: [], error: null }, rpc });
    await expect(importInvoiceRows(missing.client, ownerUserId, [csvRow])).rejects.toEqual(
      new RepositoryError("FC_CUSTOMER_NAME_NOT_FOUND"),
    );

    const ambiguous = clientWith({
      customers: {
        data: [
          { id: customerId, name: "Atelier Bleu" },
          { id: "44444444-4444-4444-8444-444444444444", name: "Atelier Bleu" },
        ],
        error: null,
      },
      rpc,
    });
    await expect(importInvoiceRows(ambiguous.client, ownerUserId, [csvRow])).rejects.toEqual(
      new RepositoryError("FC_CUSTOMER_NAME_AMBIGUOUS"),
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

it("checks invoice ownership before recording exact integer cents", async () => {
  const paymentId = "55555555-5555-4555-8555-555555555555";
  const rpc = vi.fn().mockResolvedValue({ data: paymentId, error: null });
  const { client, queries } = clientWith({
    invoices: { data: { id: invoiceId }, error: null },
    rpc,
  });

  await expect(
    recordInvoicePayment(client, ownerUserId, {
      invoiceId,
      amountCents: moneyCents(120_001),
      paidAt: localDate("2026-09-20"),
    }),
  ).resolves.toBe(paymentId);
  expect(queries.invoices.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
  expect(rpc).toHaveBeenCalledWith("record_invoice_payment", {
    p_amount_cents: 120_001,
    p_invoice_id: invoiceId,
    p_paid_at: "2026-09-20",
  });
});
