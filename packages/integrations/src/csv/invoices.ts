import { createHash } from "node:crypto";

import { localDate, parseAmountToCents } from "@fc/shared";
import type { LocalDate, MoneyCents } from "@fc/shared";
import { z } from "zod";

const invoiceCsvColumns = [
  "invoice_number",
  "customer_name",
  "issued_at",
  "due_at",
  "amount_ht",
  "vat",
  "amount_ttc",
] as const;

type InvoiceCsvColumn = (typeof invoiceCsvColumns)[number];

export class InvoiceCsvError extends Error {
  override readonly name = "InvoiceCsvError";
}

export type ParsedInvoiceCsvRow = {
  invoiceNumber: string;
  customerName: string;
  issuedAt: LocalDate;
  dueAt: LocalDate;
  amountHtCents: MoneyCents;
  vatCents: MoneyCents;
  amountTtcCents: MoneyCents;
  rawPayloadHash: string;
};

const safeTextSchema = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(maximum, `${label} is too long`);

const dateSchema = (label: string) =>
  z.string().trim().transform((value, context) => {
    try {
      return localDate(value);
    } catch {
      context.addIssue({ code: "custom", message: `${label} must be a valid ISO date` });
      return z.NEVER;
    }
  });

const amountSchema = (label: string) =>
  z.string().trim().transform((value, context) => {
    try {
      const amount = parseAmountToCents(value);
      if (amount < 0) {
        context.addIssue({ code: "custom", message: `${label} must not be negative` });
        return z.NEVER;
      }
      return amount;
    } catch {
      context.addIssue({ code: "custom", message: `${label} must be a valid amount` });
      return z.NEVER;
    }
  });

const invoiceCsvRowSchema = z
  .strictObject({
    invoice_number: safeTextSchema("invoice_number", 160),
    customer_name: safeTextSchema("customer_name", 160),
    issued_at: dateSchema("issued_at"),
    due_at: dateSchema("due_at"),
    amount_ht: amountSchema("amount_ht"),
    vat: amountSchema("vat"),
    amount_ttc: amountSchema("amount_ttc"),
  })
  .superRefine((row, context) => {
    if (row.due_at < row.issued_at) {
      context.addIssue({
        code: "custom",
        path: ["due_at"],
        message: "due_at must not be before issued_at",
      });
    }

    if (row.amount_ht + row.vat !== row.amount_ttc) {
      context.addIssue({
        code: "custom",
        path: ["amount_ttc"],
        message: "amount_ttc must equal amount_ht + vat",
      });
    }
  });

function parseCsvLine(line: string, rowNumber: number): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === ";") {
      fields.push(field);
      field = "";
      quoteClosed = false;
      continue;
    }

    if (character === '"' && field.length === 0 && !quoteClosed) {
      quoted = true;
      continue;
    }

    if (quoteClosed || character === '"') {
      throw new InvoiceCsvError(`Row ${rowNumber}: malformed CSV quoting`);
    }

    field += character;
  }

  if (quoted) {
    throw new InvoiceCsvError(`Row ${rowNumber}: malformed CSV quoting`);
  }

  fields.push(field);
  return fields;
}

function validateHeader(header: string[]): Map<InvoiceCsvColumn, number> {
  const expected = new Set<string>(invoiceCsvColumns);
  const actual = new Set(header);
  const exact =
    header.length === invoiceCsvColumns.length &&
    actual.size === invoiceCsvColumns.length &&
    header.every((column) => expected.has(column));

  if (!exact) {
    throw new InvoiceCsvError(`Header must contain exactly ${invoiceCsvColumns.join(";")}`);
  }

  return new Map(
    invoiceCsvColumns.map((column) => [column, header.indexOf(column)] as const),
  );
}

function rejectUnsafeCell(value: string, rowNumber: number) {
  if (value.includes("\u0000") || value.includes("\uFFFD")) {
    throw new InvoiceCsvError(`Row ${rowNumber}: invalid UTF-8 text`);
  }

  if (/^[=+\-@]/u.test(value.trimStart())) {
    throw new InvoiceCsvError(`Row ${rowNumber}: spreadsheet formulas are not allowed`);
  }
}

function canonicalHash(row: Omit<ParsedInvoiceCsvRow, "rawPayloadHash">): string {
  const canonical = [
    "invoice_number;customer_name;issued_at;due_at;amount_ht_cents;vat_cents;amount_ttc_cents",
    [
      row.invoiceNumber,
      row.customerName,
      row.issuedAt,
      row.dueAt,
      row.amountHtCents,
      row.vatCents,
      row.amountTtcCents,
    ].join(";"),
  ].join("\n");

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function parseInvoiceCsv(input: string): ParsedInvoiceCsvRow[] {
  const normalized = input.startsWith("\uFEFF") ? input.slice(1) : input;
  if (normalized.includes("\u0000") || normalized.includes("\uFFFD")) {
    throw new InvoiceCsvError("CSV contains invalid UTF-8 text");
  }

  const lines = normalized.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  while (lines.at(-1) === "") lines.pop();

  if (lines.length < 2) {
    throw new InvoiceCsvError("CSV must contain a header and at least one row");
  }

  const columnIndexes = validateHeader(parseCsvLine(lines[0] ?? "", 1));
  const parsedRows: ParsedInvoiceCsvRow[] = [];
  const invoiceNumbers = new Set<string>();

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const rowNumber = lineIndex + 1;
    const line = lines[lineIndex] ?? "";
    if (line.trim().length === 0) {
      throw new InvoiceCsvError(`Row ${rowNumber}: row must not be blank`);
    }

    const values = parseCsvLine(line, rowNumber);
    if (values.length !== invoiceCsvColumns.length) {
      throw new InvoiceCsvError(
        `Row ${rowNumber}: expected exactly ${invoiceCsvColumns.length} columns`,
      );
    }
    values.forEach((value) => rejectUnsafeCell(value, rowNumber));

    const rawRow = Object.fromEntries(
      invoiceCsvColumns.map((column) => [column, values[columnIndexes.get(column) ?? -1]]),
    );
    const result = invoiceCsvRowSchema.safeParse(rawRow);
    if (!result.success) {
      throw new InvoiceCsvError(
        `Row ${rowNumber}: ${result.error.issues[0]?.message ?? "invalid row"}`,
      );
    }

    if (invoiceNumbers.has(result.data.invoice_number)) {
      throw new InvoiceCsvError(
        `Row ${rowNumber}: invoice_number is duplicated in this file`,
      );
    }
    invoiceNumbers.add(result.data.invoice_number);

    const row = {
      invoiceNumber: result.data.invoice_number,
      customerName: result.data.customer_name,
      issuedAt: result.data.issued_at,
      dueAt: result.data.due_at,
      amountHtCents: result.data.amount_ht,
      vatCents: result.data.vat,
      amountTtcCents: result.data.amount_ttc,
    };
    parsedRows.push({ ...row, rawPayloadHash: canonicalHash(row) });
  }

  return parsedRows;
}
