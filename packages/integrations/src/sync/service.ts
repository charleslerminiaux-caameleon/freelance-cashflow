import type {
  BankingPage,
  NormalizedBankAccount,
  NormalizedBankTransaction,
} from "../banking";
import { withCancellation } from "../cancellation";
import { IntegrationError } from "../errors";
import type { IntegrationErrorCode } from "../errors";
import type { SyncLogEvent, SyncResult, SynchronizeBankingInput } from "./contracts";
import { SyncStoreError } from "./contracts";

const SYNC_BUDGET_MS = 120_000;
const MAX_PAGES = 10_000;

function providerError(code: IntegrationErrorCode): IntegrationError {
  return new IntegrationError(code);
}

async function databaseCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SyncStoreError) throw error;
    throw new SyncStoreError("DATABASE_ERROR", false);
  }
}

async function providerCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw providerError("PROVIDER_UNAVAILABLE");
  }
}

function stableCode(error: unknown): IntegrationErrorCode {
  if (error instanceof IntegrationError || error instanceof SyncStoreError) return error.code;
  return "DATABASE_ERROR";
}

function validateNextPage(page: number, nextPage: number | null): void {
  if (nextPage !== null && nextPage !== page + 1) {
    throw providerError("PROVIDER_INVALID_RESPONSE");
  }
}

function safeLog(log: ((event: SyncLogEvent) => void) | undefined, event: SyncLogEvent): void {
  try {
    log?.(event);
  } catch {
    // Logging is deliberately best effort and cannot change synchronization state.
  }
}

export async function synchronizeBanking(input: SynchronizeBankingInput): Promise<SyncResult> {
  const now = input.now ?? (() => performance.now());
  const startedAt = now();
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), SYNC_BUDGET_MS);
  let acquired = false;
  let connectionSucceeded = false;
  let requestedPages = 0;
  let stagedCount = 0;

  const duration = () => Math.max(0, now() - startedAt);
  const assertWithinBudget = () => {
    if (duration() >= SYNC_BUDGET_MS) controller.abort();
    if (signal.aborted) throw providerError("PROVIDER_UNAVAILABLE");
  };
  const boundedDatabase = <T>(operation: () => Promise<T>, publishing = false): Promise<T> => {
    if (duration() >= SYNC_BUDGET_MS) controller.abort();
    return withCancellation(() => databaseCall(operation), signal, () => publishing
      ? new SyncStoreError("DATABASE_ERROR", true)
      : providerError("PROVIDER_UNAVAILABLE"));
  };
  const boundedProvider = <T>(operation: () => Promise<T>): Promise<T> => {
    assertWithinBudget();
    return withCancellation(() => providerCall(operation), signal, () => providerError("PROVIDER_UNAVAILABLE"));
  };
  const beforeRequest = async () => {
    assertWithinBudget();
    if (requestedPages >= MAX_PAGES) throw providerError("PROVIDER_INVALID_RESPONSE");
    requestedPages += 1;
    await boundedDatabase(() => input.store.renew(input.ownerUserId, input.runId, signal));
    assertWithinBudget();
  };

  safeLog(input.log, { event: "sync_started", runId: input.runId });

  try {
    const window = await boundedDatabase(() =>
      input.store.acquire(input.ownerUserId, input.runId, signal),
    );
    if (window === null) return { success: true, skipped: true };
    acquired = true;
    const accounts: NormalizedBankAccount[] = [];
    const accountIds = new Set<string>();
    let accountPage = 1;

    while (true) {
      await beforeRequest();
      const response: BankingPage<NormalizedBankAccount> = await boundedProvider(() =>
        input.provider.listAccounts(accountPage, signal),
      );
      connectionSucceeded = true;
      assertWithinBudget();
      validateNextPage(accountPage, response.nextPage);
      for (const account of response.items) {
        if (accountIds.has(account.externalId)) {
          throw providerError("PROVIDER_INVALID_RESPONSE");
        }
        accountIds.add(account.externalId);
        accounts.push(account);
      }
      await boundedDatabase(() =>
        input.store.stageAccounts(
          input.ownerUserId,
          input.runId,
          accountPage,
          response.nextPage,
          response.items,
          signal,
        ),
      );
      await boundedDatabase(() => input.store.renew(input.ownerUserId, input.runId, signal));
      stagedCount += response.items.length;
      safeLog(input.log, {
        event: "page_staged",
        runId: input.runId,
        count: response.items.length,
      });
      if (response.nextPage === null) break;
      accountPage = response.nextPage;
    }

    for (const account of accounts) {
      let transactionPage = 1;
      while (true) {
        await beforeRequest();
        const response: BankingPage<NormalizedBankTransaction> = await boundedProvider(() =>
          input.provider.listTransactions({
            accountExternalId: account.externalId,
            page: transactionPage,
            updatedFrom: window.updatedFrom,
            updatedTo: window.updatedTo,
            initialCreatedFrom: window.initialCreatedFromInstant,
            timezone: input.timezone,
          }, signal),
        );
        connectionSucceeded = true;
        assertWithinBudget();
        validateNextPage(transactionPage, response.nextPage);
        await boundedDatabase(() =>
          input.store.stageTransactions(
            input.ownerUserId,
            input.runId,
            account.externalId,
            transactionPage,
            response.nextPage,
            response.items,
            signal,
          ),
        );
        await boundedDatabase(() => input.store.renew(input.ownerUserId, input.runId, signal));
        stagedCount += response.items.length;
        safeLog(input.log, {
          event: "page_staged",
          runId: input.runId,
          count: response.items.length,
        });
        if (response.nextPage === null) break;
        transactionPage = response.nextPage;
      }
    }

    assertWithinBudget();
    let publication: { created: number; updated: number };
    try {
      publication = await boundedDatabase(() =>
        input.store.publish(input.ownerUserId, input.runId, signal), true,
      );
    } catch (error) {
      if (error instanceof SyncStoreError && error.transient) {
        try {
          publication = await boundedDatabase(() =>
            input.store.publish(input.ownerUserId, input.runId, signal), true,
          );
        } catch {
          safeLog(input.log, {
            event: "sync_failed",
            runId: input.runId,
            durationMs: duration(),
            code: "DATABASE_ERROR",
          });
          return { success: false, code: "DATABASE_ERROR" };
        }
      } else {
        const code = stableCode(error);
        safeLog(input.log, {
          event: "sync_failed",
          runId: input.runId,
          durationMs: duration(),
          code,
        });
        return { success: false, code };
      }
    }

    safeLog(input.log, {
      event: "sync_succeeded",
      runId: input.runId,
      durationMs: duration(),
      count: stagedCount,
    });
    return { success: true, ...publication };
  } catch (error) {
    const code = stableCode(error);
    if (acquired) {
      try {
        await boundedDatabase(() => input.store.fail(input.ownerUserId, input.runId, code, connectionSucceeded, signal));
      } catch {
        // Cleanup is fenced and best effort; it never replaces the primary result.
      }
    }
    safeLog(input.log, {
      event: "sync_failed",
      runId: input.runId,
      durationMs: duration(),
      code,
    });
    return { success: false, code };
  } finally {
    clearTimeout(timer);
  }
}
