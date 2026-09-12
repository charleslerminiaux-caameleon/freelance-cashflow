import { createCategoryAction } from "@/features/expenses/actions";
import { createHistoryRecurringAction } from "@/features/recurring-detection/history-actions";
import {
  HistoryForm,
  type HistoryFormWorkspace,
} from "@/features/recurring-detection/history-form";
import { getHistoryRecurringWorkspace } from "@/features/recurring-detection/history-repository";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

const historyHref = "/cashflow#banking-history";

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="commercial-page expense-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Historique bancaire Qonto</p>
          <h1>Créer une charge récurrente</h1>
          <p>
            Vérifiez les informations préremplies avant de créer ou d’associer la charge.
          </p>
        </div>
        <a href={historyHref}>Retour à l’historique bancaire</a>
      </header>
      {children}
    </div>
  );
}

export default async function HistoryRecurringPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { userId } = await requireOwner();
  const { transactionId } = await params;

  try {
    const client = await createClient();
    const workspace = await getHistoryRecurringWorkspace(client, userId, transactionId);

    if (workspace.seriesState === "confirmed") {
      return (
        <PageFrame>
          {workspace.linkedExpenseId ? (
            <section className="panel">
              <p>Cette opération est déjà associée à une charge récurrente.</p>
              <a href={`/expenses#recurring-expense-${workspace.linkedExpenseId}`}>
                Ouvrir la charge existante
              </a>
            </section>
          ) : (
            <p role="alert">
              Impossible de préparer cette charge. Revenez à l’historique bancaire puis réessayez.
            </p>
          )}
        </PageFrame>
      );
    }

    const formWorkspace: HistoryFormWorkspace = {
      transactionId: workspace.transactionId,
      sourcePublication: workspace.sourcePublication,
      label: workspace.label,
      amountCents: workspace.amountCents,
      dayOfMonth: workspace.dayOfMonth,
      nextDate: workspace.nextDate,
      currency: workspace.currency,
      seriesState: workspace.seriesState,
      possibleDuplicates: workspace.possibleDuplicates.map(({ label, amountCents }) => ({
        label,
        amountCents,
      })),
      existingExpenses: workspace.existingExpenses,
      categories: workspace.categories,
    };

    return (
      <PageFrame>
        <section className="panel" aria-label="Nouvelle charge depuis l’historique">
          <HistoryForm
            action={createHistoryRecurringAction}
            createCategoryAction={createCategoryAction}
            workspace={formWorkspace}
          />
        </section>
      </PageFrame>
    );
  } catch {
    return (
      <PageFrame>
        <p role="alert">
          Impossible de préparer cette charge. Revenez à l’historique bancaire puis réessayez.
        </p>
      </PageFrame>
    );
  }
}
