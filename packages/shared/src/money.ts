declare const moneyBrand: unique symbol;

export type MoneyCents = number & { readonly [moneyBrand]: true };

export function moneyCents(value: number): MoneyCents {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Money must be safe integer cents");
  }

  return value as MoneyCents;
}

export function parseAmountToCents(input: string): MoneyCents {
  const normalized = input.trim().replaceAll(/\s/g, "").replace(",", ".");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    throw new Error("Amount must contain at most two decimals");
  }

  const sign = match[1] === "-" ? -1 : 1;
  const wholeCents = Number(match[2]) * 100;
  const fractionalCents = Number((match[3] ?? "").padEnd(2, "0"));
  return moneyCents(sign * (wholeCents + fractionalCents));
}

export function formatMoney(value: MoneyCents): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value / 100);
}
