import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { BankingView } from "./banking-view";
import type { BankingSnapshot, TransactionHistory } from "./repository";
import { localDate } from "@fc/shared";
const banking: BankingSnapshot = {integration:{id:"qonto",status:"error",last_success_at:"2026-09-10T10:00:00Z",last_connection_succeeded:false,last_error_code:"PROVIDER_AUTH_EXPIRED"},accounts:[{id:"a",name:"Compte exemple",iban_masked:null,currency:"USD",current_balance_cents:12345,available_balance_cents:10000,status:"closed",is_current:false,updated_at:"2026-09-10T10:00:00Z"}]};
const history: TransactionHistory = {items:[{id:"t",bank_account_id:"a",currency:"USD",amount_cents:1000,direction:"outflow",status:"pending",label:"<script>example</script>",counterparty:null,transaction_date:localDate("2026-09-09"),value_date:null,updated_at:"2026-09-10T10:00:00Z"}],page:2,hasNext:true};
it("shows currencies, closed/noncurrent accounts, available balance and stale publication separately from history", () => {
 const {container} = render(<BankingView banking={banking} history={history} currency="EUR" searchParameters={{horizon:"180",scenario:"probable",expenses:"0"}} />);
 expect(screen.getByRole("heading",{name:"Comptes Qonto"})).toBeInTheDocument(); expect(screen.getByText(/Clôturé/)).toBeInTheDocument(); expect(screen.getByText(/Hors inventaire actuel/)).toBeInTheDocument(); expect(screen.getByText(/100,00 USD/)).toBeInTheDocument(); expect(screen.getByText(/Dernière synchronisation en échec/)).toBeInTheDocument();
 const table = screen.getByRole("table",{name:"Historique bancaire"}); expect(within(table).getByText("En attente")).toBeInTheDocument(); expect(within(table).getByText("<script>example</script>")).toBeInTheDocument(); expect(container.querySelector("script")).toBeNull();
 const next = new URL(screen.getByRole("link",{name:"Transactions suivantes"}).getAttribute("href")!,"http://localhost"); expect(next.searchParams.get("bankPage")).toBe("3"); expect(next.searchParams.get("horizon")).toBe("180");
 expect(screen.getByRole("link",{name:"Transactions précédentes"})).toBeInTheDocument();
});
it("provides an empty state without inventing bank data", () => {render(<BankingView banking={{integration:null,accounts:[]}} history={{items:[],page:1,hasNext:false}} currency="EUR" />); expect(screen.getByText(/Aucun compte bancaire publié/)).toBeInTheDocument(); expect(screen.queryByRole("link",{name:"Transactions suivantes"})).not.toBeInTheDocument();});

it("offers history creation only for eligible published outflows with an internal-id URL", () => {
  const eligibleAccount = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Compte principal",
    iban_masked: null,
    currency: "EUR",
    current_balance_cents: 50_000,
    available_balance_cents: null,
    status: "active" as const,
    is_current: true,
    updated_at: "2026-09-11T10:00:00Z",
  };
  const eligibleTransaction = {
    id: "22222222-2222-4222-8222-222222222222",
    bank_account_id: eligibleAccount.id,
    currency: "EUR",
    amount_cents: 12_345,
    direction: "outflow" as const,
    status: "completed" as const,
    label: "Cloud synthétique",
    counterparty: "Fournisseur synthétique",
    transaction_date: localDate("2026-09-09"),
    value_date: null,
    updated_at: "2026-09-11T10:00:00Z",
  };

  render(
    <BankingView
      banking={{ integration: null, accounts: [eligibleAccount] }}
      history={{
        items: [
          eligibleTransaction,
          { ...eligibleTransaction, id: "33333333-3333-4333-8333-333333333333", status: "pending" },
          { ...eligibleTransaction, id: "44444444-4444-4444-8444-444444444444", direction: "inflow" },
          { ...eligibleTransaction, id: "55555555-5555-4555-8555-555555555555", currency: "USD" },
          { ...eligibleTransaction, id: "66666666-6666-4666-8666-666666666666", amount_cents: 0 },
        ],
        page: 1,
        hasNext: false,
      }}
      currency="EUR"
    />,
  );

  const link = screen.getByRole("link", { name: /Créer une charge récurrente/i });
  expect(link).toHaveAttribute(
    "href",
    "/cashflow/recurring/22222222-2222-4222-8222-222222222222",
  );
  expect(link.getAttribute("href")).not.toContain("amount");
  expect(link.getAttribute("href")).not.toContain("label");
  expect(screen.getAllByRole("link", { name: /Créer une charge récurrente/i })).toHaveLength(1);
});

it.each([
  [{ status: "closed" as const }, true],
  [{ status: "active" as const }, false],
])("hides history creation for an ineligible account %j", (accountPatch, isCurrent) => {
  const account = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Compte principal",
    iban_masked: null,
    currency: "EUR",
    current_balance_cents: 50_000,
    available_balance_cents: null,
    is_current: isCurrent,
    updated_at: "2026-09-11T10:00:00Z",
    ...accountPatch,
  };
  render(
    <BankingView
      banking={{ integration: null, accounts: [account] }}
      history={{
        items: [{
          id: "22222222-2222-4222-8222-222222222222",
          bank_account_id: account.id,
          currency: "EUR",
          amount_cents: 12_345,
          direction: "outflow",
          status: "completed",
          label: "Cloud synthétique",
          counterparty: null,
          transaction_date: localDate("2026-09-09"),
          value_date: null,
          updated_at: "2026-09-11T10:00:00Z",
        }],
        page: 1,
        hasNext: false,
      }}
      currency="EUR"
    />,
  );
  expect(screen.queryByRole("link", { name: /Créer une charge récurrente/i })).toBeNull();
});
