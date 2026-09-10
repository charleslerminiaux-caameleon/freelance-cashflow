import { describe, expect, it } from "vitest";
import { normalizedCustomerSchema, normalizedInvoiceSchema } from "./invoicing";
const invoice = {externalId:"invoice-example",customer:{externalId:"customer-example",name:"Client exemple"},invoiceNumber:"EX-001",issuedAt:"2026-09-01",dueAt:"2026-09-30",amountHtCents:10000,amountVatCents:2000,amountTtcCents:12000,currency:"EUR",status:"issued",payment:{kind:"unknown"}};
describe("normalized invoice boundary without Tiime wire assumptions", () => {
 it("retains explicit unknown payment without inventing paid zero", () => {const value=normalizedInvoiceSchema.parse(invoice);expect(value.payment).toEqual({kind:"unknown"}); expect(value.payment).not.toHaveProperty("paidAmountCents");});
 it("accepts known partial payment with unknown date", () => {expect(normalizedInvoiceSchema.parse({...invoice,payment:{kind:"known",paidAmountCents:5000,paidAt:null}}).payment).toEqual({kind:"known",paidAmountCents:5000,paidAt:null});});
 it("accepts a known payment business date",()=>{expect(normalizedInvoiceSchema.safeParse({...invoice,payment:{kind:"known",paidAmountCents:12000,paidAt:"2026-09-09"}}).success).toBe(true);});
 it.each([
  {payment:undefined}, {payment:{kind:"known",paidAmountCents:0}}, {payment:{kind:"known",paidAmountCents:12001,paidAt:null}}, {payment:{kind:"known",paidAmountCents:-1,paidAt:null}}, {payment:{kind:"known",paidAmountCents:1.1,paidAt:null}}, {payment:{kind:"known",paidAmountCents:1,paidAt:"2026-02-30"}}, {payment:{kind:"unknown",paidAmountCents:0}},
  {amountTtcCents:12001}, {amountHtCents:Number.MAX_SAFE_INTEGER+1}, {amountVatCents:-1}, {amountTtcCents:12.5}, {issuedAt:"2026-02-30"}, {dueAt:"not-date"}, {currency:"eur"}, {status:"provider-specific"}, {externalId:""}, {invoiceNumber:""}, {customer:{name:"Example"}},
 ])("rejects incomplete or inconsistent invoice %j", change=>expect(normalizedInvoiceSchema.safeParse({...invoice,...change}).success).toBe(false));
 it("validates near-limit totals without unsafe addition",()=>expect(normalizedInvoiceSchema.safeParse({...invoice,amountHtCents:Number.MAX_SAFE_INTEGER,amountVatCents:1,amountTtcCents:Number.MAX_SAFE_INTEGER}).success).toBe(false));
});
it.each([{externalId:"",name:"Example"},{externalId:"x",name:" "},{name:"Example"}])("requires customer identity and name %j",value=>expect(normalizedCustomerSchema.safeParse(value).success).toBe(false));
it("exports a provider-agnostic customer contract",()=>expect(normalizedCustomerSchema.parse({externalId:"c",name:"Exemple"})).toEqual({externalId:"c",name:"Exemple"}));
