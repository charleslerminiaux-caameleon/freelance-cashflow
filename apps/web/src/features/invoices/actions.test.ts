import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepositoryError } from "../repository-error";

const {
  createClient,
  createInvoice,
  importInvoiceRows,
  recordInvoicePayment,
  requireOwner,
  revalidatePath,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  createInvoice: vi.fn(),
  importInvoiceRows: vi.fn(),
  recordInvoicePayment: vi.fn(),
  requireOwner: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("./repository", () => ({
  createInvoice,
  importInvoiceRows,
  recordInvoicePayment,
}));

import {
  createInvoiceAction,
  importInvoiceCsvAction,
  recordInvoicePaymentAction,
} from "./actions";

const initialState = { message: null, success: false };
const customerId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const paymentIdempotencyKey = "33333333-3333-4333-8333-333333333333";
const header =
  "invoice_number;customer_name;issued_at;due_at;amount_ht;vat;amount_ttc";

function manualInvoiceFormData() {
  const formData = new FormData();
  formData.set("invoiceNumber", "F-2026-001");
  formData.set("customerId", customerId);
  formData.set("billingScheduleItemId", "");
  formData.set("issuedAt", "2026-09-01");
  formData.set("dueAt", "2026-09-30");
  formData.set("expectedPaymentDate", "2026-09-30");
  formData.set("amountHt", "1 000,01");
  formData.set("vat", "200,00");
  return formData;
}

function paymentFormData() {
  const formData = new FormData();
  formData.set("invoiceId", invoiceId);
  formData.set("idempotencyKey", paymentIdempotencyKey);
  formData.set("amount", "1 200,01");
  formData.set("paidAt", "2026-09-20");
  return formData;
}

function csvFormData(csv: string) {
  const formData = new FormData();
  const file = new File([csv], "factures.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(csv),
  });
  formData.set("csv", file);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ userId: "owner-1" });
  createClient.mockResolvedValue({});
  createInvoice.mockResolvedValue(invoiceId);
  importInvoiceRows.mockResolvedValue({ createdCount: 1, unchangedCount: 0 });
  recordInvoicePayment.mockResolvedValue("33333333-3333-4333-8333-333333333333");
});

it("creates a manual invoice with owner-scoped exact-cent input", async () => {
  const result = await createInvoiceAction(initialState, manualInvoiceFormData());

  expect(result).toEqual({ message: "Facture créée.", success: true });
  expect(createInvoice).toHaveBeenCalledWith(
    {},
    "owner-1",
    expect.objectContaining({
      invoiceNumber: "F-2026-001",
      amountHtCents: 100_001,
      vatCents: 20_000,
      amountTtcCents: 120_001,
    }),
  );
  expect(revalidatePath).toHaveBeenCalledWith("/invoices");
});

it("returns a safe actionable invoice-number conflict", async () => {
  createInvoice.mockRejectedValue(
    new RepositoryError("FC_INVOICE_NUMBER_CONFLICT"),
  );

  const result = await createInvoiceAction(initialState, manualInvoiceFormData());

  expect(result).toEqual({
    message: "Ce numéro existe déjà avec des informations différentes.",
    success: false,
  });
});

it("names the linked billing step when it has already been invoiced", async () => {
  createInvoice.mockRejectedValue(new RepositoryError("FC_SCHEDULE_ALREADY_INVOICED"));

  const result = await createInvoiceAction(initialState, manualInvoiceFormData());

  expect(result).toEqual({
    message: "Cette étape de facturation a déjà été facturée.",
    success: false,
  });
});

it("names the selected billing step in a schedule mismatch", async () => {
  createInvoice.mockRejectedValue(new RepositoryError("FC_SCHEDULE_INVOICE_MISMATCH"));

  const result = await createInvoiceAction(initialState, manualInvoiceFormData());

  expect(result).toEqual({
    message: "Le client et les montants doivent correspondre à l’étape de facturation sélectionnée.",
    success: false,
  });
});

describe("importInvoiceCsvAction", () => {
  it("validates every CSV row before asking the repository to write", async () => {
    const result = await importInvoiceCsvAction(
      initialState,
      csvFormData(
        `${header}\nF-001;Atelier Bleu;2026-09-01;2026-09-30;1000;200;1200\nF-002;Client privé;2026-09-02;2026-10-02;500;100;599`,
      ),
    );

    expect(result).toEqual({
      message: "Ligne 3 : le total TTC doit être égal au HT + TVA.",
      success: false,
    });
    expect(importInvoiceRows).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("Client privé");
  });

  it("reports created and unchanged rows after an idempotent import", async () => {
    importInvoiceRows.mockResolvedValue({ createdCount: 1, unchangedCount: 2 });

    const result = await importInvoiceCsvAction(
      initialState,
      csvFormData(
        `${header}\nF-001;Atelier Bleu;2026-09-01;2026-09-30;1000;200;1200`,
      ),
    );

    expect(result).toEqual({
      message: "Import terminé : 1 créée, 2 déjà présentes.",
      success: true,
    });
    expect(importInvoiceRows).toHaveBeenCalledWith({}, "owner-1", [
      expect.objectContaining({ invoiceNumber: "F-001", amountTtcCents: 120_000 }),
    ]);
  });

  it("never exposes a database conflict detail", async () => {
    importInvoiceRows.mockRejectedValue(
      new RepositoryError("FC_INVOICE_NUMBER_CONFLICT"),
    );

    const result = await importInvoiceCsvAction(
      initialState,
      csvFormData(
        `${header}\nF-001;Atelier Bleu;2026-09-01;2026-09-30;1000;200;1200`,
      ),
    );

    expect(result).toEqual({
      message: "Un numéro existe déjà avec des informations différentes. Corrigez le fichier avant de relancer l’import.",
      success: false,
    });
    expect(JSON.stringify(result)).not.toContain("postgres");
  });
});

it("records a payment in exact cents and revalidates list and detail", async () => {
  const result = await recordInvoicePaymentAction(initialState, paymentFormData());

  expect(result).toEqual({
    completedIdempotencyKey: paymentIdempotencyKey,
    message: "Paiement enregistré.",
    success: true,
  });
  expect(recordInvoicePayment).toHaveBeenCalledWith({}, "owner-1", {
    invoiceId,
    idempotencyKey: paymentIdempotencyKey,
    amountCents: 120_001,
    paidAt: "2026-09-20",
  });
  expect(revalidatePath).toHaveBeenCalledWith(`/invoices/${invoiceId}`);
  expect(revalidatePath).toHaveBeenCalledWith("/invoices");
});

it("maps overpayment to a safe message without leaking the RPC error", async () => {
  recordInvoicePayment.mockRejectedValue(
    new RepositoryError("FC_PAYMENT_EXCEEDS_BALANCE"),
  );

  const result = await recordInvoicePaymentAction(initialState, paymentFormData());

  expect(result).toEqual({
    message: "Le paiement dépasse le solde restant de la facture.",
    success: false,
  });
  expect(JSON.stringify(result)).not.toContain("FC_PAYMENT_EXCEEDS_BALANCE");
});
