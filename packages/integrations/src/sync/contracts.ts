import type {
  BankingProvider,
  NormalizedBankAccount,
  NormalizedBankTransaction,
} from "../banking";
import type { IntegrationErrorCode } from "../errors";

export type SyncLogEvent = {
  event: "sync_started" | "page_staged" | "sync_succeeded" | "sync_failed";
  runId: string;
  durationMs?: number;
  count?: number;
  code?: IntegrationErrorCode;
};

export type SyncResult =
  | { success: true; created: number; updated: number }
  | { success: false; code: IntegrationErrorCode };

export interface BankingSyncStore {
  acquire(
    ownerUserId: string,
    runId: string,
  ): Promise<{
    integrationId: string;
    initialCreatedFrom: string;
    initialCreatedFromInstant: string;
    updatedFrom: string;
    updatedTo: string;
  }>;
  renew(ownerUserId: string, runId: string): Promise<void>;
  stageAccounts(
    ownerUserId: string,
    runId: string,
    page: number,
    nextPage: number | null,
    items: NormalizedBankAccount[],
  ): Promise<void>;
  stageTransactions(
    ownerUserId: string,
    runId: string,
    accountExternalId: string,
    page: number,
    nextPage: number | null,
    items: NormalizedBankTransaction[],
  ): Promise<void>;
  publish(ownerUserId: string, runId: string): Promise<{ created: number; updated: number }>;
  fail(
    ownerUserId: string,
    runId: string,
    code: IntegrationErrorCode,
    connectionSucceeded: boolean,
  ): Promise<void>;
}

export type SynchronizeBankingInput = {
  ownerUserId: string;
  runId: string;
  timezone: string;
  provider: BankingProvider;
  store: BankingSyncStore;
  now?: () => number;
  log?: (event: SyncLogEvent) => void;
};

export class SyncStoreError extends Error {
  constructor(
    readonly code: "SYNC_LOCKED" | "DATABASE_ERROR",
    readonly transient: boolean,
  ) {
    super("Banking synchronization storage failed");
    this.name = "SyncStoreError";
  }
}
