import { describe, expect, it } from "vitest";

import { parseInvoiceCsv } from "./invoices";

const header =
  "invoice_number;customer_name;issued_at;due_at;amount_ht;vat;amount_ttc";

describe("parseInvoiceCsv", () => {
  it("parses French decimal amounts into exact integer cents", () => {
    const [row] = parseInvoiceCsv(
      `${header}\nF-001;Atelier Bleu;2026-09-01;2026-09-30;1000,00;200,00;1200,00`,
    );

    expect(row).toMatchObject({
      invoiceNumber: "F-001",
      customerName: "Atelier Bleu",
      issuedAt: "2026-09-01",
      dueAt: "2026-09-30",
      amountHtCents: 100_000,
      vatCents: 20_000,
      amountTtcCents: 120_000,
    });
    expect(row?.rawPayloadHash).toBe(
      "816681480867799f07ad79e9970217ad68926251df733bf18dda9e97315da7bb",
    );
  });

  it("normalizes a UTF-8 BOM, CRLF, header order, whitespace, and decimal spelling", () => {
    const canonical = parseInvoiceCsv(
      `${header}\nF-001;Atelier Bleu;2026-09-01;2026-09-30;1000,00;200,00;1200,00`,
    )[0];
    const reordered = parseInvoiceCsv(
      "\uFEFFcustomer_name;amount_ttc;vat;due_at;invoice_number;amount_ht;issued_at\r\n Atelier Bleu ;1200.00;200;2026-09-30; F-001 ;1 000,0;2026-09-01\r\n",
    )[0];

    expect(reordered).toEqual(canonical);
  });

  it("supports quoted semicolons and doubled quotes", () => {
    const [row] = parseInvoiceCsv(
      `${header}\nF-002;"Atelier; \"\"Bleu\"\"";2026-09-01;2026-09-30;10;2;12`,
    );

    expect(row?.customerName).toBe('Atelier; "Bleu"');
  });

  it("hashes the structured row without semicolon boundary collisions", () => {
    const [first] = parseInvoiceCsv(
      `${header}\n"F;001";Atelier Bleu;2026-09-01;2026-09-30;10;2;12`,
    );
    const [second] = parseInvoiceCsv(
      `${header}\nF;"001;Atelier Bleu";2026-09-01;2026-09-30;10;2;12`,
    );

    expect(first?.rawPayloadHash).not.toBe(second?.rawPayloadHash);
  });

  it("rejects any missing, duplicate, unknown, or case-changed column", () => {
    expect(() =>
      parseInvoiceCsv(
        "invoice_number;customer_name;issued_at;due_at;amount_ht;vat\nF-1;A;2026-09-01;2026-09-02;1;0",
      ),
    ).toThrow("Header must contain exactly");
    expect(() =>
      parseInvoiceCsv(
        `${header};notes\nF-1;A;2026-09-01;2026-09-02;1;0;1;private`,
      ),
    ).toThrow("Header must contain exactly");
    expect(() =>
      parseInvoiceCsv(
        "invoice_number;customer_name;issued_at;due_at;amount_ht;vat;vat\nF-1;A;2026-09-01;2026-09-02;1;0;0",
      ),
    ).toThrow("Header must contain exactly");
    expect(() =>
      parseInvoiceCsv(
        "Invoice_number;customer_name;issued_at;due_at;amount_ht;vat;amount_ttc\nF-1;A;2026-09-01;2026-09-02;1;0;1",
      ),
    ).toThrow("Header must contain exactly");
  });

  it("reports the physical row number for invalid totals after validating the whole input", () => {
    expect(() =>
      parseInvoiceCsv(
        `${header}\nF-001;Atelier Bleu;2026-09-01;2026-09-30;1000;200;1200\nF-002;Client Rouge;2026-09-02;2026-10-02;500;100;599`,
      ),
    ).toThrow("Row 3: amount_ttc must equal amount_ht + vat");
  });

  it("reports invalid business dates and issue/due ordering by row", () => {
    expect(() =>
      parseInvoiceCsv(
        `${header}\nF-001;Atelier Bleu;2026-02-30;2026-09-30;1;0;1`,
      ),
    ).toThrow("Row 2: issued_at must be a valid ISO date");
    expect(() =>
      parseInvoiceCsv(
        `${header}\nF-001;Atelier Bleu;2026-09-30;2026-09-01;1;0;1`,
      ),
    ).toThrow("Row 2: due_at must not be before issued_at");
  });

  it("rejects spreadsheet formulas without echoing their contents", () => {
    const dangerous = '"=HYPERLINK(""https://example.invalid/private"")"';

    try {
      parseInvoiceCsv(
        `${header}\nF-001;${dangerous};2026-09-01;2026-09-30;1;0;1`,
      );
      throw new Error("expected formula rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Row 2: spreadsheet formulas are not allowed");
      expect((error as Error).message).not.toContain("HYPERLINK");
    }
  });

  it("rejects empty input and blank data rows with numbered errors", () => {
    expect(() => parseInvoiceCsv("")).toThrow("CSV must contain a header and at least one row");
    expect(() => parseInvoiceCsv(`${header}\n`)).toThrow(
      "CSV must contain a header and at least one row",
    );
    expect(() => parseInvoiceCsv(`${header}\n\nF-1;A;2026-09-01;2026-09-02;1;0;1`)).toThrow(
      "Row 2: row must not be blank",
    );
  });

  it("rejects a duplicate invoice number before import writes can start", () => {
    expect(() =>
      parseInvoiceCsv(
        `${header}\nF-001;Atelier Bleu;2026-09-01;2026-09-30;1000;200;1200\n F-001 ;Atelier Bleu;2026-09-01;2026-09-30;1000;200;1200`,
      ),
    ).toThrow("Row 3: invoice_number is duplicated in this file");
  });
});
