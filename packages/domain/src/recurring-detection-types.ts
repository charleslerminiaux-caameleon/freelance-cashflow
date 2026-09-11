export type DetectionTransaction = {
  id: string;
  accountId: string;
  currency: string;
  label: string;
  amountCents: number;
  direction: "inflow" | "outflow";
  status: string;
  transactionDate: string;
};

export type DetectionAccount = {
  id: string;
  currency: string;
  active: boolean;
  current: boolean;
};

export type RecurringCandidate = {
  accountId: string;
  currency: string;
  normalizedLabel: string;
  label: string;
  amountCents: number;
  dayOfMonth: number;
  transactionIds: string[];
  lastPaymentDate: string;
  nextDate: string;
};

export type MonthlyDetectionInput = {
  today: string;
  currency: string;
  accounts: DetectionAccount[];
  transactions: DetectionTransaction[];
};
