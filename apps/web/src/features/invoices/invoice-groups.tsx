import { deriveInvoiceStatus } from "@fc/domain";
import { formatMoney, moneyCents } from "@fc/shared";
import type { LocalDate } from "@fc/shared";

type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  amountTtcCents: number;
  paidAmountCents: number;
  dueAt: LocalDate;
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "cancelled";
};

type ScheduleListItem = {
  id: string;
  label: string;
  reference: string;
  customerName: string;
  plannedInvoiceDate: LocalDate;
  amountTtcCents: number;
};

type InvoiceStage = "issued" | "partially_paid" | "paid" | "overdue";

function currentStage(invoice: InvoiceListItem, today: LocalDate): InvoiceStage | null {
  if (invoice.status === "cancelled") return null;
  if (invoice.status === "draft") return "issued";
  return deriveInvoiceStatus({
    cancelled: false,
    amountTtcCents: moneyCents(invoice.amountTtcCents),
    paidAmountCents: moneyCents(invoice.paidAmountCents),
    dueAt: invoice.dueAt,
    today,
  }) as InvoiceStage;
}

function EmptyGroup({ children }: { children: string }) {
  return <p className="muted-copy invoice-group-empty">{children}</p>;
}

function InvoiceCards({ invoices }: { invoices: InvoiceListItem[] }) {
  if (invoices.length === 0) return <EmptyGroup>Aucune facture dans cette étape.</EmptyGroup>;

  return (
    <div className="invoice-group-list">
      {invoices.map((invoice) => (
        <a className="invoice-row" href={`/invoices/${invoice.id}`} key={invoice.id}>
          <span>
            <strong>{invoice.invoiceNumber}</strong>
            <small>{invoice.customerName} · échéance {invoice.dueAt}</small>
          </span>
          <span>
            <strong>{formatMoney(moneyCents(invoice.amountTtcCents))}</strong>
            {invoice.paidAmountCents > 0 && invoice.paidAmountCents < invoice.amountTtcCents ? (
              <small>encaissé {formatMoney(moneyCents(invoice.paidAmountCents))}</small>
            ) : null}
          </span>
        </a>
      ))}
    </div>
  );
}

export function InvoiceGroups({
  invoices,
  scheduleItems,
  today,
}: {
  invoices: InvoiceListItem[];
  scheduleItems: ScheduleListItem[];
  today: LocalDate;
}) {
  const grouped = new Map<InvoiceStage, InvoiceListItem[]>([
    ["issued", []],
    ["partially_paid", []],
    ["paid", []],
    ["overdue", []],
  ]);

  for (const invoice of invoices) {
    const stage = currentStage(invoice, today);
    if (stage) grouped.get(stage)?.push(invoice);
  }

  return (
    <div className="invoice-pipeline">
      <section className="panel invoice-group" aria-labelledby="invoice-stage-planned">
        <div className="section-heading">
          <h2 id="invoice-stage-planned">À facturer</h2>
          <span>{scheduleItems.length}</span>
        </div>
        {scheduleItems.length === 0 ? (
          <EmptyGroup>Aucune étape de facturation à facturer.</EmptyGroup>
        ) : (
          <div className="invoice-group-list">
            {scheduleItems.map((schedule) => (
              <article className="invoice-row" key={schedule.id}>
                <span>
                  <strong>{schedule.label}</strong>
                  <small>{schedule.reference} · {schedule.customerName}</small>
                </span>
                <span>
                  <strong>{formatMoney(moneyCents(schedule.amountTtcCents))}</strong>
                  <small>prévue {schedule.plannedInvoiceDate}</small>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      {([
        ["issued", "Facturé"],
        ["partially_paid", "À encaisser"],
        ["paid", "Payé"],
        ["overdue", "En retard"],
      ] as const).map(([stage, label]) => (
        <section
          className={`panel invoice-group invoice-group-${stage}`}
          aria-labelledby={`invoice-stage-${stage}`}
          key={stage}
        >
          <div className="section-heading">
            <h2 id={`invoice-stage-${stage}`}>{label}</h2>
            <span>{grouped.get(stage)?.length ?? 0}</span>
          </div>
          <InvoiceCards invoices={grouped.get(stage) ?? []} />
        </section>
      ))}
    </div>
  );
}
