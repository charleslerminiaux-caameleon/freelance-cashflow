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
  const cents = sign * (wholeCents + fractionalCents);
  return moneyCents(cents === 0 ? 0 : cents);
}

export function formatMoney(value: MoneyCents): string {
  const cents = BigInt(value);
  const sign = cents < 0n ? "-" : "";
  const absoluteCents = cents < 0n ? -cents : cents;
  const euros = absoluteCents / 100n;
  const fractionalCents = (absoluteCents % 100n).toString().padStart(2, "0");
  const formattedEuros = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(euros);

  return `${sign}${formattedEuros},${fractionalCents}\u00a0€`;
}
