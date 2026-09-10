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
