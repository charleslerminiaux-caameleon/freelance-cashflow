import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import {
  SuggestionPanel,
  type SuggestionPanelProps,
  type SuggestionReview,
} from "./suggestion-panel";

const suggestion: SuggestionReview = {
  id: "11111111-1111-4111-8111-111111111111",
  eligible: true,
  label: "Cloud synthétique",
  amountCents: 12_345,
  dayOfMonth: 9,
  nextDate: "2026-10-09",
  sourcePublication: "2026-09-11T10:00:00.123456Z",
  currency: "EUR",
  evidence: [
    {
      label: "Cloud juillet",
      amountCents: 12_000,
      transactionDate: "2026-07-09",
    },
    {
      label: "Cloud août",
      amountCents: 12_345,
      transactionDate: "2026-08-09",
    },
  ],
  possibleDuplicates: [
    {
      label: "Cloud déjà saisi",
      amountCents: 12_000,
    },
  ],
};

const idleAction = async () => ({ success: false, message: null });

function props(overrides: Partial<SuggestionPanelProps> = {}): SuggestionPanelProps {
  return {
    suggestions: [suggestion],
    ignored: [],
    categories: [{ id: "55555555-5555-4555-8555-555555555555", name: "Logiciels" }],
    existingExpenses: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        label: "Cloud déjà saisi",
        amountCents: 12_000,
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        label: "Assurance sans ressemblance",
        amountCents: 5_000,
      },
    ],
    lastAnalyzedAt: "2026-09-11T10:00:00Z",
    analysisFailed: false,
    confirmAction: idleAction,
    createCategoryAction: idleAction,
    dismissAction: idleAction,
    reexamineAction: idleAction,
    analyzeAction: idleAction,
    ...overrides,
  };
}

it("renders an empty review state and manual analysis control", () => {
  render(<SuggestionPanel {...props({ suggestions: [], ignored: [] })} />);

  expect(screen.getByRole("heading", { name: "Récurrences à confirmer" })).toBeInTheDocument();
  expect(screen.getByText(/aucune récurrence à confirmer/i)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Analyser les transactions importées" }),
  ).toBeInTheDocument();
});

it("shows estimate, evidence details, and committed uncategorized defaults", () => {
  render(<SuggestionPanel {...props()} />);

  expect(screen.getByRole("heading", { name: "Cloud synthétique" })).toBeInTheDocument();
  expect(
    screen.getByText((content, element) => element?.tagName === "STRONG" && /123,45\s*€/iu.test(content)),
  ).toBeInTheDocument();
  expect(screen.getByText(/prochaine échéance.*2026-10-09/i)).toBeInTheDocument();
  fireEvent.click(screen.getByText("2 paiements observés"));
  expect(screen.getByText(/Cloud juillet/)).toBeInTheDocument();
  expect(screen.getByLabelText("Catégorie pour Cloud synthétique")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Créer une catégorie" })).toBeInTheDocument();
  expect(screen.getByLabelText("Niveau de certitude pour Cloud synthétique")).toHaveValue(
    "committed",
  );
  expect(screen.getByText(/aucun effet sur la trésorerie avant confirmation/i)).toBeInTheDocument();
});

it("submits corrected values and offers every unlinked monthly expense for association", async () => {
  const received: FormData[] = [];
  const confirmAction = vi.fn(async (_state, data: FormData) => {
    received.push(data);
    return { success: true, message: "Récurrence confirmée." };
  });
  render(<SuggestionPanel {...props({ confirmAction })} />);

  fireEvent.change(screen.getByLabelText("Libellé pour Cloud synthétique"), {
    target: { value: "Cloud corrigé" },
  });
  fireEvent.change(screen.getByLabelText("Montant pour Cloud synthétique"), {
    target: { value: "130,00" },
  });
  const association = screen.getByLabelText("Charge mensuelle existante pour Cloud synthétique");
  expect(association).toHaveTextContent("Cloud déjà saisi");
  expect(association).toHaveTextContent("Assurance sans ressemblance");
  fireEvent.change(association, { target: { value: "66666666-6666-4666-8666-666666666666" } });
  expect(screen.queryByLabelText(/créer quand même/i)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Associer Cloud synthétique" }));

  await waitFor(() => expect(confirmAction).toHaveBeenCalledOnce());
  expect(received[0]?.get("label")).toBe("Cloud corrigé");
  expect(received[0]?.get("amount")).toBe("130,00");
  expect(received[0]?.get("existingExpenseId")).toBe(
    "66666666-6666-4666-8666-666666666666",
  );
});

it("requires a separate explicit override to create despite possible duplicates", async () => {
  const received: FormData[] = [];
  const confirmAction = vi.fn(async (_state, data: FormData) => {
    received.push(data);
    return { success: true, message: "Récurrence confirmée." };
  });
  render(<SuggestionPanel {...props({ confirmAction })} />);

  expect(screen.getByText(/charge mensuelle similaire existe/i)).toBeInTheDocument();
  const override = screen.getByLabelText(/créer quand même une nouvelle charge/i);
  expect(override).not.toBeChecked();
  fireEvent.click(override);
  fireEvent.click(screen.getByRole("button", { name: "Confirmer Cloud synthétique" }));

  await waitFor(() => expect(confirmAction).toHaveBeenCalledOnce());
  expect(received[0]?.get("allowDuplicate")).toBe("on");
});

it("disables repeat confirmation while the server action is pending", async () => {
  let resolve!: (value: { success: boolean; message: string }) => void;
  const confirmAction = vi.fn(
    () => new Promise<{ success: boolean; message: string }>((done) => (resolve = done)),
  );
  render(<SuggestionPanel {...props({ confirmAction })} />);

  fireEvent.click(screen.getByRole("button", { name: "Confirmer Cloud synthétique" }));

  expect(await screen.findByRole("button", { name: "Confirmation en cours…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmation en cours…" }));
  expect(confirmAction).toHaveBeenCalledOnce();
  await act(async () => resolve({ success: true, message: "Récurrence confirmée." }));
});

it("keeps ineligible and ignored suggestions outside confirmation forms", () => {
  render(
    <SuggestionPanel
      {...props({
        suggestions: [{ ...suggestion, id: "77777777-7777-4777-8777-777777777777", eligible: false }],
        ignored: [{ ...suggestion, id: "88888888-8888-4888-8888-888888888888", label: "Ancien outil" }],
      })}
    />,
  );

  expect(screen.getByRole("heading", { name: "Suggestions à réanalyser" })).toBeInTheDocument();
  expect(screen.getByText(/ne remplissent plus les critères.*relancez l’analyse/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirmer Cloud synthétique" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Suggestions ignorées" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Réexaminer Ancien outil" })).toBeInTheDocument();
});

it("renders persisted analysis failure separately from prior successful analysis", () => {
  render(
    <SuggestionPanel
      {...props({
        analysisFailed: true,
        lastAnalyzedAt: "2026-09-10T10:00:00Z",
      })}
    />,
  );

  expect(screen.getByText(/dernière analyse réussie.*2026-09-10/i)).toBeInTheDocument();
  expect(
    screen.getByText(/analyse des récurrences a échoué.*relancez l’analyse/i),
  ).toHaveAttribute("role", "alert");
});
