import "server-only";

import type { ParsedInvoiceCsvRow } from "@fc/integrations";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { businessDateSchema } from "../commercial-schema";
import { repositoryError, RepositoryError } from "../repository-error";
import type {
  InvoiceCommand,
  InvoiceUpdateCommand,
  PaymentCommand,
  PaymentDeletionCommand,
} from "./schema";

const invoiceCustomerSchema = z.object({ name: z.string() });

const invoiceRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  billing_schedule_item_id: z.string().uuid().nullable(),
  provider: z.enum(["manual", "csv", "pennylane"]),
  external_id: z.string().nullable(),
  invoice_number: z.string(),
  issued_at: businessDateSchema,
  due_at: businessDateSchema,
  expected_payment_date: businessDateSchema,
  amount_ht_cents: z.number().int().safe(),
  vat_cents: z.number().int().safe(),
  amount_ttc_cents: z.number().int().safe(),
  paid_amount_cents: z.number().int().safe(),
  status: z.enum(["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"]),
  paid_at: businessDateSchema.nullable(),
  raw_payload_hash: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  customer: invoiceCustomerSchema,
});

const invoicePaymentRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  amount_cents: z.number().int().safe(),
  paid_at: businessDateSchema,
  match_type: z.enum(["manual", "exact", "suggested"]),
  match_confidence_basis_points: z.number().int().min(0).max(10_000),
  created_at: z.string(),
});

const invoiceableScheduleRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  label: z.string(),
  planned_invoice_date: businessDateSchema,
  amount_ht_cents: z.number().int().safe(),
  vat_cents: z.number().int().safe(),
  amount_ttc_cents: z.number().int().safe(),
  expected_payment_date: businessDateSchema,
  status: z.literal("planned"),
  engagement: z.object({
    reference: z.string(),
    customer_id: z.string().uuid(),
    customer: invoiceCustomerSchema,
  }),
});

export type Invoice = z.infer<typeof invoiceRowSchema>;
export type InvoicePayment = z.infer<typeof invoicePaymentRowSchema>;
export type InvoiceableScheduleItem = z.infer<typeof invoiceableScheduleRowSchema>;

const invoiceColumns = `
  id,
  owner_user_id,
  customer_id,
  billing_schedule_item_id,
  provider,
  external_id,
  invoice_number,
  issued_at,
  due_at,
  expected_payment_date,
  amount_ht_cents,
  vat_cents,
  amount_ttc_cents,
  paid_amount_cents,
  status,
  paid_at,
  raw_payload_hash,
  created_at,
  updated_at,
  customer:customers!invoices_owner_customer_fk(name)
`;

const paymentColumns = `
  id,
  owner_user_id,
  invoice_id,
  amount_cents,
  paid_at,
  match_type,
  match_confidence_basis_points,
  created_at
`;

const scheduleColumns = `
  id,
  owner_user_id,
  engagement_id,
  label,
  planned_invoice_date,
  amount_ht_cents,
  vat_cents,
  amount_ttc_cents,
  expected_payment_date,
  status,
  engagement:engagements!billing_schedule_items_owner_engagement_fk(
    reference,
    customer_id,
    customer:customers!engagements_owner_customer_fk(name)
  )
`;

export async function listInvoices(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<Invoice[]> {
  const { data, error } = await client
    .from("invoices")
    .select(invoiceColumns)
    .eq("owner_user_id", ownerUserId)
    .order("due_at", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw repositoryError(error);
  return z.array(invoiceRowSchema).parse(data);
}

export async function getInvoice(
  client: SupabaseClient,
  ownerUserId: string,
  invoiceId: string,
): Promise<Invoice | null> {
  const { data, error } = await client
    .from("invoices")
    .select(invoiceColumns)
    .eq("id", invoiceId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error) throw repositoryError(error);
  return data === null ? null : invoiceRowSchema.parse(data);
}

export async function listInvoicePayments(
  client: SupabaseClient,
  ownerUserId: string,
  invoiceId: string,
): Promise<InvoicePayment[]> {
  const { data, error } = await client
    .from("invoice_payments")
    .select(paymentColumns)
    .eq("invoice_id", invoiceId)
    .eq("owner_user_id", ownerUserId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw repositoryError(error);
  return z.array(invoicePaymentRowSchema).parse(data);
}

export async function listInvoiceableScheduleItems(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<InvoiceableScheduleItem[]> {
  const { data, error } = await client
    .from("billing_schedule_items")
    .select(scheduleColumns)
    .eq("owner_user_id", ownerUserId)
    .eq("status", "planned")
    .order("planned_invoice_date", { ascending: true });

  if (error) throw repositoryError(error);
  return z.array(invoiceableScheduleRowSchema).parse(data);
}

async function requireOwnedRow(
  client: SupabaseClient,
  table: "customers" | "billing_schedule_items" | "invoices",
  id: string,
  ownerUserId: string,
  failureCode: string,
) {
  const { data, error } = await client
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error) throw repositoryError(error);
  if (!data) throw new RepositoryError(failureCode);
}

type InvoiceRpcCommand = {
  customerId: string;
  billingScheduleItemId: string | null;
  provider: "manual" | "csv";
  invoiceNumber: string;
  issuedAt: string;
  dueAt: string;
  expectedPaymentDate: string;
  amountHtCents: number;
  vatCents: number;
  amountTtcCents: number;
  rawPayloadHash: string | null;
};

const invoiceRpcResultSchema = z.object({
  invoice_id: z.string().uuid(),
  created: z.boolean(),
});

type InvoiceRpcResult = z.infer<typeof invoiceRpcResultSchema>;

async function createInvoiceRpc(
  client: SupabaseClient,
  command: InvoiceRpcCommand,
): Promise<InvoiceRpcResult> {
  const { data, error } = await client.rpc("create_invoice", {
    p_customer_id: command.customerId,
    p_billing_schedule_item_id: command.billingScheduleItemId,
    p_provider: command.provider,
    p_invoice_number: command.invoiceNumber,
    p_issued_at: command.issuedAt,
    p_due_at: command.dueAt,
    p_expected_payment_date: command.expectedPaymentDate,
    p_amount_ht_cents: command.amountHtCents,
    p_vat_cents: command.vatCents,
    p_amount_ttc_cents: command.amountTtcCents,
    p_raw_payload_hash: command.rawPayloadHash,
  });

  if (error) throw repositoryError(error);
  return invoiceRpcResultSchema.parse(data);
}

export async function createInvoice(
  client: SupabaseClient,
  ownerUserId: string,
  command: InvoiceCommand,
): Promise<string> {
  await requireOwnedRow(client, "customers", command.customerId, ownerUserId, "FC_CUSTOMER_NOT_FOUND");

  if (command.billingScheduleItemId !== null) {
    await requireOwnedRow(
      client,
      "billing_schedule_items",
      command.billingScheduleItemId,
      ownerUserId,
      "FC_SCHEDULE_NOT_INVOICEABLE",
    );
  }

  const result = await createInvoiceRpc(client, {
    ...command,
    provider: "manual",
    rawPayloadHash: null,
  });
  return result.invoice_id;
}

const importCustomerSchema = z.object({ id: z.string().uuid(), name: z.string() });
const persistedImportInvoiceSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid(),
  billing_schedule_item_id: z.string().uuid().nullable(),
  provider: z.enum(["manual", "csv", "pennylane"]),
  invoice_number: z.string(),
  issued_at: businessDateSchema,
  due_at: businessDateSchema,
  expected_payment_date: businessDateSchema,
  amount_ht_cents: z.number().int().safe(),
  vat_cents: z.number().int().safe(),
  amount_ttc_cents: z.number().int().safe(),
  raw_payload_hash: z.string().nullable(),
});

function resolveImportCustomers(
  customers: z.infer<typeof importCustomerSchema>[],
  rows: ParsedInvoiceCsvRow[],
): Map<string, string> {
  const idsByName = new Map<string, string[]>();
  for (const customer of customers) {
    idsByName.set(customer.name, [...(idsByName.get(customer.name) ?? []), customer.id]);
  }

  const customerIds = new Map<string, string>();
  for (const row of rows) {
    const ids = idsByName.get(row.customerName) ?? [];
    if (ids.length === 0) throw new RepositoryError("FC_CUSTOMER_NAME_NOT_FOUND");
    if (ids.length > 1) throw new RepositoryError("FC_CUSTOMER_NAME_AMBIGUOUS");
    customerIds.set(row.customerName, ids[0] as string);
  }
  return customerIds;
}

function isSameImportedInvoice(
  persisted: z.infer<typeof persistedImportInvoiceSchema>,
  row: ParsedInvoiceCsvRow,
  customerId: string,
): boolean {
  return (
    persisted.customer_id === customerId &&
    persisted.billing_schedule_item_id === null &&
    persisted.provider === "csv" &&
    persisted.issued_at === row.issuedAt &&
    persisted.due_at === row.dueAt &&
    persisted.expected_payment_date === row.dueAt &&
    persisted.amount_ht_cents === row.amountHtCents &&
    persisted.vat_cents === row.vatCents &&
    persisted.amount_ttc_cents === row.amountTtcCents &&
    persisted.raw_payload_hash === row.rawPayloadHash
  );
}

const preflightPageSize = 500;
const preflightFilterChunkSize = 100;

function uniqueChunks(values: string[]): string[][] {
  const uniqueValues = [...new Set(values)];
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueValues.length; index += preflightFilterChunkSize) {
    chunks.push(uniqueValues.slice(index, index + preflightFilterChunkSize));
  }
  return chunks;
}

async function fetchImportCustomers(
  client: SupabaseClient,
  ownerUserId: string,
  customerNames: string[],
): Promise<z.infer<typeof importCustomerSchema>[]> {
  const customers: z.infer<typeof importCustomerSchema>[] = [];
  for (const names of uniqueChunks(customerNames)) {
    for (let offset = 0; ; offset += preflightPageSize) {
      const { data, error } = await client
        .from("customers")
        .select("id, name")
        .eq("owner_user_id", ownerUserId)
        .in("name", names)
        .order("id", { ascending: true })
        .range(offset, offset + preflightPageSize - 1);
      if (error) throw repositoryError(error);

      const page = z.array(importCustomerSchema).parse(data);
      customers.push(...page);
      if (page.length < preflightPageSize) break;
    }
  }
  return customers;
}

async function fetchImportInvoices(
  client: SupabaseClient,
  ownerUserId: string,
  invoiceNumbers: string[],
): Promise<z.infer<typeof persistedImportInvoiceSchema>[]> {
  const invoices: z.infer<typeof persistedImportInvoiceSchema>[] = [];
  for (const numbers of uniqueChunks(invoiceNumbers)) {
    for (let offset = 0; ; offset += preflightPageSize) {
      const { data, error } = await client
        .from("invoices")
        .select(
          "id, customer_id, billing_schedule_item_id, provider, invoice_number, issued_at, due_at, expected_payment_date, amount_ht_cents, vat_cents, amount_ttc_cents, raw_payload_hash",
        )
        .eq("owner_user_id", ownerUserId)
        .in("invoice_number", numbers)
        .order("id", { ascending: true })
        .range(offset, offset + preflightPageSize - 1);
      if (error) throw repositoryError(error);

      const page = z.array(persistedImportInvoiceSchema).parse(data);
      invoices.push(...page);
      if (page.length < preflightPageSize) break;
    }
  }
  return invoices;
}

export async function importInvoiceRows(
  client: SupabaseClient,
  ownerUserId: string,
  rows: ParsedInvoiceCsvRow[],
): Promise<{ createdCount: number; unchangedCount: number }> {
  const customers = await fetchImportCustomers(
    client,
    ownerUserId,
    rows.map((row) => row.customerName),
  );
  const customerIds = resolveImportCustomers(customers, rows);
  const invoiceNumbers = rows.map((row) => row.invoiceNumber);
  const existing = await fetchImportInvoices(client, ownerUserId, invoiceNumbers);
  const existingByNumber = new Map(existing.map((invoice) => [invoice.invoice_number, invoice]));

  for (const row of rows) {
    const persisted = existingByNumber.get(row.invoiceNumber);
    const customerId = customerIds.get(row.customerName) as string;
    if (persisted && !isSameImportedInvoice(persisted, row, customerId)) {
      throw new RepositoryError("FC_INVOICE_NUMBER_CONFLICT");
    }
  }

  const missingRows = rows.filter((row) => !existingByNumber.has(row.invoiceNumber));
  let createdCount = 0;
  let unchangedCount = rows.length - missingRows.length;
  for (const row of missingRows) {
    const result = await createInvoiceRpc(client, {
      customerId: customerIds.get(row.customerName) as string,
      billingScheduleItemId: null,
      provider: "csv",
      invoiceNumber: row.invoiceNumber,
      issuedAt: row.issuedAt,
      dueAt: row.dueAt,
      expectedPaymentDate: row.dueAt,
      amountHtCents: row.amountHtCents,
      vatCents: row.vatCents,
      amountTtcCents: row.amountTtcCents,
      rawPayloadHash: row.rawPayloadHash,
    });
    if (result.created) createdCount += 1;
    else unchangedCount += 1;
  }

  return { createdCount, unchangedCount };
}

export async function recordInvoicePayment(
  client: SupabaseClient,
  ownerUserId: string,
  command: PaymentCommand,
): Promise<string> {
  await requireOwnedRow(
    client,
    "invoices",
    command.invoiceId,
    ownerUserId,
    "FC_INVOICE_NOT_PAYABLE",
  );

  const { data, error } = await client.rpc("record_invoice_payment", {
    p_invoice_id: command.invoiceId,
    p_idempotency_key: command.idempotencyKey,
    p_amount_cents: command.amountCents,
    p_paid_at: command.paidAt,
  });

  if (error) throw repositoryError(error);
  return z.string().uuid().parse(data);
}

export async function updateInvoice(
  client: SupabaseClient,
  ownerUserId: string,
  command: InvoiceUpdateCommand,
): Promise<string> {
  await requireOwnedRow(client, "invoices", command.invoiceId, ownerUserId, "FC_INVOICE_NOT_FOUND");
  await requireOwnedRow(client, "customers", command.customerId, ownerUserId, "FC_CUSTOMER_NOT_FOUND");

  const { data, error } = await client.rpc("update_invoice", {
    p_invoice_id: command.invoiceId,
    p_customer_id: command.customerId,
    p_invoice_number: command.invoiceNumber,
    p_issued_at: command.issuedAt,
    p_due_at: command.dueAt,
    p_expected_payment_date: command.expectedPaymentDate,
    p_amount_ht_cents: command.amountHtCents,
    p_vat_cents: command.vatCents,
    p_amount_ttc_cents: command.amountTtcCents,
  });

  if (error) throw repositoryError(error);
  return z.string().uuid().parse(data);
}

export async function deleteInvoicePayment(
  client: SupabaseClient,
  ownerUserId: string,
  command: PaymentDeletionCommand,
): Promise<string> {
  await requireOwnedRow(client, "invoices", command.invoiceId, ownerUserId, "FC_INVOICE_NOT_FOUND");

  const { data, error } = await client.rpc("delete_invoice_payment", {
    p_invoice_id: command.invoiceId,
    p_payment_id: command.paymentId,
  });

  if (error) throw repositoryError(error);
  return z.string().uuid().parse(data);
}
