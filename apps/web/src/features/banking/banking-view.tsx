import { formatMoney, moneyCents } from "@fc/shared";
import type { BankingSnapshot, TransactionHistory } from "./repository";

const statuses = { pending: "En attente", completed: "Comptabilisée", declined: "Refusée", reversed: "Annulée" };
function amount(cents: number, currency: string): string {
  return formatMoney(moneyCents(cents)).replace(/\u00a0€$/, ` ${currency}`);
}

export function BankingView({ banking, history, currency, searchParameters = {} }: {
  banking: BankingSnapshot;
  history: TransactionHistory;
  currency: string;
  searchParameters?: Record<string, string | string[] | undefined>;
}) {
  const { integration, accounts } = banking;
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  function canCreateRecurring(transaction: TransactionHistory["items"][number]): boolean {
    const account = accountsById.get(transaction.bank_account_id);
    return transaction.status === "completed" && transaction.direction === "outflow"
      && transaction.amount_cents > 0 && transaction.currency === currency
      && account?.is_current === true && account.status === "active"
      && account.currency === currency;
  }
  function historyLink(page: number): string {
    const parameters = new URLSearchParams();
    for (const key of ["horizon", "scenario", "filters", "invoices", "expenses", "signedOrders", "weightedOpportunities"]) {
      const value = searchParameters[key]; if (typeof value === "string") parameters.set(key, value);
    }
    parameters.set("bankPage", String(page));
    return `/cashflow?${parameters}`;
  }
  return <section className="dashboard-panel banking-panel" aria-labelledby="banking-title">
    <header className="dashboard-panel-heading"><div><p className="eyebrow">Données bancaires publiées</p><h2 id="banking-title">Comptes Qonto</h2></div><a href="/integrations">Gérer Qonto</a></header>
    {integration?.last_success_at && <p>Dernière publication : <time dateTime={integration.last_success_at}>{integration.last_success_at}</time></p>}
    {integration?.last_error_code && <p role="status">Dernière synchronisation en échec. Les données précédemment publiées sont conservées.</p>}
    {accounts.length === 0 ? <p>Aucun compte bancaire publié. La projection utilise le solde manuel.</p> : <div className="bank-account-grid">
      {accounts.map(account => <article className="bank-account" key={account.id}>
        <h3>{account.name}</h3><p>{account.status === "active" ? "Actif" : "Clôturé"} · {account.currency}</p>
        {!account.is_current && <p>Hors inventaire actuel</p>}
        {account.iban_masked && <p>{account.iban_masked}</p>}
        <dl><dt>Solde courant</dt><dd>{amount(account.current_balance_cents, account.currency)}</dd>
          <dt>Solde disponible autorisé</dt><dd>{account.available_balance_cents === null ? "Non fourni" : amount(account.available_balance_cents, account.currency)}</dd></dl>
        {account.currency !== currency && <p>Exclu de la projection en {currency} · aucune conversion</p>}
        {(!account.is_current || account.status === "closed") && <p>Compte exclu du solde d’ouverture</p>}
      </article>)}
    </div>}
    <h3 id="banking-history">Historique bancaire</h3><p>La projection part des soldes de comptes publiés. Cet historique n’est pas ajouté aux événements prévisionnels.</p>
    <div className="treasury-table-wrap"><table className="treasury-table" aria-label="Historique bancaire">
      <thead><tr><th scope="col">Date</th><th scope="col">Compte</th><th scope="col">Libellé</th><th scope="col">Statut</th><th scope="col">Montant</th><th scope="col">Action</th></tr></thead>
      <tbody>{history.items.length === 0 ? <tr><td colSpan={6}>Aucune transaction sur cette page.</td></tr> : history.items.map(transaction => <tr key={transaction.id}>
        <td data-label="Date">{transaction.transaction_date}</td><td data-label="Compte">{accounts.find(account => account.id === transaction.bank_account_id)?.name ?? "Compte bancaire"}</td>
        <th scope="row" data-label="Libellé">{transaction.label}{transaction.counterparty && <small>{transaction.counterparty}</small>}</th>
        <td data-label="Statut">{statuses[transaction.status]}</td><td data-label="Montant">{transaction.direction === "inflow" ? "+" : "−"}{amount(transaction.amount_cents, transaction.currency)}</td>
        <td data-label="Action">{canCreateRecurring(transaction) ? (
          <a href={`/cashflow/recurring/${transaction.id}`}>Créer une charge récurrente</a>
        ) : "—"}</td>
      </tr>)}</tbody>
    </table></div>
    <nav className="bank-pagination" aria-label="Pages de l’historique bancaire">
      {history.page > 1 && <a href={historyLink(history.page - 1)}>Transactions précédentes</a>}
      <span>Page {history.page}</span>
      {history.hasNext && <a href={historyLink(history.page + 1)}>Transactions suivantes</a>}
    </nav>
  </section>;
}
