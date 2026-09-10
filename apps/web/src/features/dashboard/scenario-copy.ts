import type { ForecastScenario } from "@fc/domain";

export const scenarioCopy: Record<ForecastScenario, { label: string; description: string }> = {
  certain: {
    label: "Facturé",
    description: "Factures émises restant à encaisser; les sorties certaines continuent d’être prises en compte dans la trésorerie.",
  },
  committed: {
    label: "Commandes signées",
    description: "Facturé plus les facturations planifiées des commandes signées; les opportunités sont exclues.",
  },
  probable: {
    label: "Pipeline pondéré",
    description: "Commandes signées plus les opportunités ouvertes pondérées par leur probabilité (exemple : 10 000 € à 60 % compte pour 6 000 €).",
  },
};
