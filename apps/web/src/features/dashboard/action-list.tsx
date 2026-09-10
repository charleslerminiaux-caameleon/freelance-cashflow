import { formatMoney, formatShortLocalDate } from "@fc/shared";

import type { DashboardViewModel } from "./view-model";

export function ActionList({
  overdueInvoices,
  itemsToInvoice,
}: Pick<DashboardViewModel, "overdueInvoices" | "itemsToInvoice">) {
  const actionCount = overdueInvoices.length + itemsToInvoice.length;

  return (
    <section className="dashboard-panel dashboard-actions" aria-labelledby="dashboard-actions-title">
      <header className="dashboard-panel-heading">
        <h2 id="dashboard-actions-title">À traiter</h2>
        <span>{actionCount}</span>
      </header>
      {actionCount === 0 ? (
        <p className="dashboard-empty-copy">Aucune relance ni facturation urgente.</p>
      ) : (
        <ul className="dashboard-detail-list">
          {overdueInvoices.map((invoice) => (
            <li key={invoice.id} className="dashboard-action-overdue">
              <a href={`/invoices/${invoice.id}`}>
                <span>
                  <strong>Relancer {invoice.customerName}</strong>
                  <small>{invoice.invoiceNumber} · échue depuis {invoice.daysOverdue} jours</small>
                </span>
                <b>{formatMoney(invoice.remainingCents)}</b>
              </a>
            </li>
          ))}
          {itemsToInvoice.map((item) => (
            <li key={item.id}>
              <a href={`/engagements/${item.engagementId}`}>
                <span>
                  <strong>Facturer {item.customerName}</strong>
                  <small>{item.engagementReference} · prévu le {formatShortLocalDate(item.plannedInvoiceDate)}</small>
                </span>
                <b>{formatMoney(item.amountCents)}</b>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
