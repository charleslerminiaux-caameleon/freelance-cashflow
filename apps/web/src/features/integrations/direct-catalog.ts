export const directCatalog = {
  pennylane: { name: "Pennylane", description: "Importez vos clients, factures et restes à encaisser depuis Pennylane.",
    requirement: "Offre Essential ou supérieure et jeton API en lecture seule. Factures en euros ; brouillons et avoirs exclus.",
    documentation: "https://pennylane.readme.io/docs/generating-my-api-token" },
  revolut: { name: "Revolut Business", description: "Retrouvez vos comptes et opérations Revolut Business dans votre trésorerie.",
    requirement: "Compte Revolut Business Grow ou supérieur et accès Business API avec la permission READ. Les comptes Revolut personnels et Pro ne sont pas pris en charge.",
    documentation: "https://developer.revolut.com/docs/guides/manage-accounts/get-started/make-your-first-api-request" },
  bunq: { name: "bunq", description: "Retrouvez vos comptes de paiement bunq et leurs paiements comptabilisés.",
    requirement: "Clé API personnelle créée dans bunq et offre donnant accès à l’API. Épargne, placements et autorisations de carte en attente exclus.",
    documentation: "https://doc.bunq.com/basics/authentication/api-keys" },
} as const;
