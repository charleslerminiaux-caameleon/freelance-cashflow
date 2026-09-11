export type NormalizedBankAccount = {
  externalId: string;
  name: string;
  ibanMasked: string | null;
  currency: string;
  currentBalanceCents: number;
  availableBalanceCents: number | null;
  status: "active" | "closed";
  updatedAt: string;
};

export type NormalizedBankTransaction = {
  externalId: string;
  accountExternalId: string;
  currency: string;
  amountCents: number;
  direction: "inflow" | "outflow";
  status: "pending" | "completed" | "declined" | "reversed";
  label: string;
  counterparty: string | null;
  transactionDate: string;
  valueDate: string | null;
  updatedAt: string;
};

export type BankingPage<T> = {
  items: T[];
  nextPage: number | null;
};

export type TransactionWindow = {
  accountExternalId: string;
  page: number;
  updatedFrom: string;
  updatedTo: string;
  initialCreatedFrom: string | null;
  timezone: string;
};

export interface BankingProvider {
  listAccounts(page: number, signal?: AbortSignal): Promise<BankingPage<NormalizedBankAccount>>;
  listTransactions(
    window: TransactionWindow,
    signal?: AbortSignal,
  ): Promise<BankingPage<NormalizedBankTransaction>>;
}
