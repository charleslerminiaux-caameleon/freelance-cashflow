import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { localDate } from "@fc/shared";
import { describe, expect, it, vi } from "vitest";

import { CsvImportForm } from "./csv-import-form";
import { InvoiceForm } from "./invoice-form";
import { InvoiceGroups } from "./invoice-groups";
import { PaymentForm } from "./payment-form";

const idleAction = async () => ({ message: null, success: false });
const paymentIdempotencyKey = "55555555-5555-4555-8555-555555555555";

it("collects a manual invoice and can link one billing schedule item", () => {
  render(
    <InvoiceForm
      action={idleAction}
      customers={[{ id: "customer-1", name: "Atelier Bleu" }]}
      scheduleItems={[
        {
          id: "schedule-1",
          label: "Acompte",
          reference: "CMD-001",
          customerId: "customer-1",
          customerName: "Atelier Bleu",
          plannedInvoiceDate: "2026-09-01",
          expectedPaymentDate: "2026-09-30",
          amountHtCents: 100_001,
          vatCents: 20_000,
        },
      ]}
      today="2026-09-01"
    />,
  );

  fireEvent.change(screen.getByLabelText("Échéance de commande (facultative)"), {
    target: { value: "schedule-1" },
  });

  expect(screen.getByLabelText("Client")).toHaveValue("customer-1");
  expect(screen.getByLabelText("Montant HT")).toHaveValue("1000,01");
  expect(screen.getByLabelText("TVA")).toHaveValue("200,00");
  expect(screen.getByLabelText("Date d’émission")).toHaveValue("2026-09-01");
  expect(screen.getByLabelText("Date d’échéance")).toHaveValue("2026-09-30");
  expect(screen.getByRole("button", { name: "Créer la facture" })).toBeInTheDocument();
});

it("offers the documented CSV-only import boundary", () => {
  render(<CsvImportForm action={idleAction} />);

  expect(screen.getByLabelText("Fichier CSV")).toHaveAttribute("accept", ".csv,text/csv");
  expect(screen.getByText(/invoice_number;customer_name;issued_at/)).toBeInTheDocument();
  expect(screen.getByText(/formules de tableur sont refusées/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Importer les factures" })).toBeInTheDocument();
});

it("defaults a payment to the exact remaining balance", () => {
  render(
    <PaymentForm
      action={idleAction}
      invoiceId="invoice-1"
      initialIdempotencyKey={paymentIdempotencyKey}
      remainingCents={120_001}
      today="2026-09-20"
    />,
  );

  expect(
    screen.getByText((_, element) =>
      element?.tagName === "STRONG" && element.textContent === "1 200,01 €",
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Montant du paiement")).toHaveValue("1200,01");
  expect(screen.getByLabelText("Date du paiement")).toHaveValue("2026-09-20");
  expect(
    screen.getByDisplayValue(paymentIdempotencyKey, { exact: true }),
  ).toHaveAttribute("name", "idempotencyKey");
  expect(screen.getByRole("button", { name: "Enregistrer le paiement" })).toBeInTheDocument();
});

it("keeps the same payment idempotency key when a failed submission is retried", async () => {
  const submittedKeys: FormDataEntryValue[] = [];
  const failedAction = async (_state: unknown, formData: FormData) => {
    submittedKeys.push(formData.get("idempotencyKey") as FormDataEntryValue);
    return { message: "Réessayez.", success: false };
  };
  render(
    <PaymentForm
      action={failedAction}
      invoiceId="invoice-1"
      initialIdempotencyKey={paymentIdempotencyKey}
      remainingCents={120_001}
      today="2026-09-20"
    />,
  );
  const form = screen.getByRole("button", { name: "Enregistrer le paiement" }).closest("form")!;

  fireEvent.submit(form);
  await waitFor(() => expect(submittedKeys).toHaveLength(1));
  fireEvent.submit(form);

  await waitFor(() => {
    expect(submittedKeys).toEqual([paymentIdempotencyKey, paymentIdempotencyKey]);
  });
});

it("rotates the payment idempotency key after a confirmed payment", async () => {
  const nextKey = "77777777-7777-4777-8777-777777777777";
  const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(nextKey);
  const confirmedAction = async () => ({
    completedIdempotencyKey: paymentIdempotencyKey,
    message: "Paiement enregistré.",
    success: true,
  });
  render(
    <PaymentForm
      action={confirmedAction}
      invoiceId="invoice-1"
      initialIdempotencyKey={paymentIdempotencyKey}
      remainingCents={120_001}
      today="2026-09-20"
    />,
  );

  fireEvent.submit(screen.getByRole("button", { name: "Enregistrer le paiement" }).closest("form")!);

  await waitFor(() => {
    expect(screen.getByDisplayValue(nextKey, { exact: true })).toBeInTheDocument();
  });
  randomUUID.mockRestore();
});

describe("InvoiceGroups", () => {
  it("groups schedules and persisted invoices into the five billing stages", () => {
    render(
      <InvoiceGroups
        today={localDate("2026-09-20")}
        scheduleItems={[
          {
            id: "schedule-1",
            label: "Acompte",
            reference: "CMD-001",
            customerName: "Atelier Bleu",
            plannedInvoiceDate: localDate("2026-09-21"),
            amountTtcCents: 120_000,
          },
        ]}
        invoices={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            invoiceNumber: "F-ISSUED",
            customerName: "Atelier Bleu",
            amountTtcCents: 120_000,
            paidAmountCents: 0,
            dueAt: localDate("2026-09-30"),
            status: "issued",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            invoiceNumber: "F-PARTIAL",
            customerName: "Client Vert",
            amountTtcCents: 200_000,
            paidAmountCents: 50_000,
            dueAt: localDate("2026-09-30"),
            status: "partially_paid",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            invoiceNumber: "F-PAID",
            customerName: "Client Or",
            amountTtcCents: 300_000,
            paidAmountCents: 300_000,
            dueAt: localDate("2026-09-10"),
            status: "paid",
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            invoiceNumber: "F-LATE",
            customerName: "Client Corail",
            amountTtcCents: 400_000,
            paidAmountCents: 0,
            dueAt: localDate("2026-09-19"),
            status: "issued",
          },
        ]}
      />,
    );

    const section = (name: string) =>
      screen.getByRole("region", { name });

    expect(within(section("À facturer")).getByText("Acompte")).toBeInTheDocument();
    expect(within(section("Facturé")).getByText("F-ISSUED")).toBeInTheDocument();
    expect(within(section("À encaisser")).getByText("F-PARTIAL")).toBeInTheDocument();
    expect(within(section("Payé")).getByText("F-PAID")).toBeInTheDocument();
    expect(within(section("En retard")).getByText("F-LATE")).toBeInTheDocument();
  });
});
