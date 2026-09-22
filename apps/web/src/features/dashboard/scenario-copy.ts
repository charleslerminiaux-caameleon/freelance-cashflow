import type { ForecastScenario } from "@fc/domain";

export const scenarioCopy: Record<ForecastScenario, { label: string; description: string }> = {
  certain: {
    label: "Facturé",
    description: "Factures émises restant à encaisser.",
  },
  committed: {
    label: "Facturé + commandes signées",
    description: "Factures émises et échéances non encore facturées des commandes signées.",
  },
  probable: {
    label: "Facturé + signé + opportunités",
    description: "Factures émises, échéances non encore facturées des commandes signées et opportunités ouvertes pondérées par leur probabilité (10 000 € à 60 % comptent pour 6 000 €).",
  },
};
