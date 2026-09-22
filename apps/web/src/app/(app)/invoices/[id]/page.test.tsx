import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/require-owner',()=>({requireOwner:async()=>({userId:'owner'})}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({})}));
vi.mock('@/features/invoices/repository',()=>({getInvoice:async()=>({id:'33333333-3333-4333-8333-333333333333',provider:'pennylane',invoice_number:'PL-001',customer:{name:'API Client'},customer_id:'c',status:'partially_paid',amount_ht_cents:10000,vat_cents:2000,amount_ttc_cents:12000,paid_amount_cents:6000,paid_at:null,issued_at:'2026-09-01',due_at:'2026-09-30',expected_payment_date:'2026-09-30'}),listInvoicePayments:async()=>[]}));
vi.mock('@/features/invoices/business-date',()=>({getOwnerBusinessDate:async()=> '2026-09-21'}));
vi.mock('@/features/customers/repository',()=>({listCustomers:async()=>[]}));
vi.mock('@/features/invoices/actions',()=>({updateInvoiceAction:vi.fn(),recordInvoicePaymentAction:vi.fn(),deleteInvoicePaymentAction:vi.fn()}));
import Page from './page';
it('shows provider settlement and directs edits to Pennylane instead of exposing manual forms',async()=>{
 render(await Page({params:Promise.resolve({id:'33333333-3333-4333-8333-333333333333'})}));
 expect(screen.queryByText('Modifier la facture')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/Enregistrer/})).not.toBeInTheDocument();
 expect(screen.getByText(/montants.*Pennylane/i)).toBeInTheDocument();
 expect(screen.queryByText('Aucun paiement enregistré pour cette facture.')).not.toBeInTheDocument();
});
