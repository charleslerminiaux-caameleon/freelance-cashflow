import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  BankingSyncStore,
  NormalizedBankAccount,
  NormalizedBankTransaction,
} from "@fc/integrations/server";
import { SyncStoreError } from "@fc/integrations/server";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const instantSchema = z.string().datetime({ offset: true });
const acquireSchema = z
  .object({
    integration_id: z.string().uuid(),
    run_id: z.string().uuid(),
    initial_created_from: isoDateSchema,
    initial_created_from_instant: instantSchema,
    updated_from: instantSchema,
    updated_to: instantSchema,
  })
  .strict();
const publicationSchema = z
  .object({
    created: z.number().int().safe().nonnegative(),
    updated: z.number().int().safe().nonnegative(),
  })
  .strict();

type RpcError = { code?: unknown; message?: unknown };

function isTransientDatabaseCode(code: unknown): boolean {
  return (
    typeof code === "string" &&
    (code.startsWith("08") ||
      code === "40001" ||
      code === "40P01" ||
      code.startsWith("53") ||
      code === "57P01" ||
      code === "57P02" ||
      code === "57P03")
  );
}

function rpcError(error: RpcError, status: number): SyncStoreError {
  if (error.code === "P0001" && error.message === "SYNC_LOCKED") {
    return new SyncStoreError("SYNC_LOCKED", false);
  }
  const transportFailed = status === 0 && error.code === "";
  return new SyncStoreError(
    "DATABASE_ERROR",
    transportFailed || isTransientDatabaseCode(error.code),
  );
}

function invalidOutput(): SyncStoreError {
  return new SyncStoreError("DATABASE_ERROR", false);
}

function accountPayload(account: NormalizedBankAccount) {
  return {
    external_id: account.externalId,
    name: account.name,
    iban_masked: account.ibanMasked,
    currency: account.currency,
    current_balance_cents: account.currentBalanceCents,
    available_balance_cents: account.availableBalanceCents,
    status: account.status,
    updated_at: account.updatedAt,
  };
}

function transactionPayload(transaction: NormalizedBankTransaction) {
  return {
    external_id: transaction.externalId,
    account_external_id: transaction.accountExternalId,
    currency: transaction.currency,
    amount_cents: transaction.amountCents,
    direction: transaction.direction,
    status: transaction.status,
    label: transaction.label,
    counterparty: transaction.counterparty,
    transaction_date: transaction.transactionDate,
    value_date: transaction.valueDate,
    updated_at: transaction.updatedAt,
  };
}

export function createBankingSyncStore(client: SupabaseClient): BankingSyncStore {
  async function call(name: string, parameters: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    try {
      const request = client.rpc(name, parameters);
      const { data, error, status } = await (signal ? request.abortSignal(signal) : request);
      if (error) throw rpcError(error, status);
      return data;
    } catch (error) {
      if (error instanceof SyncStoreError) throw error;
      throw new SyncStoreError("DATABASE_ERROR", true);
    }
  }

  return {
    async acquire(ownerUserId, runId, signal) {
      const data = await call("acquire_banking_sync", {
        p_owner_user_id: ownerUserId,
        p_run_id: runId,
      }, signal);
      const parsed = acquireSchema.safeParse(data);
      if (!parsed.success || parsed.data.run_id !== runId) throw invalidOutput();
      return {
        integrationId: parsed.data.integration_id,
        initialCreatedFrom: parsed.data.initial_created_from,
        initialCreatedFromInstant: new Date(
          parsed.data.initial_created_from_instant,
        ).toISOString(),
        updatedFrom: new Date(parsed.data.updated_from).toISOString(),
        updatedTo: new Date(parsed.data.updated_to).toISOString(),
      };
    },

    async renew(ownerUserId, runId, signal) {
      await call("renew_banking_sync", {
        p_owner_user_id: ownerUserId,
        p_run_id: runId,
      }, signal);
    },

    async stageAccounts(ownerUserId, runId, page, nextPage, items, signal) {
      await call("stage_banking_page", {
        p_owner_user_id: ownerUserId,
        p_run_id: runId,
        p_kind: "accounts",
        p_account_external_id: null,
        p_page: page,
        p_next_page: nextPage,
        p_items: items.map(accountPayload),
      }, signal);
    },

    async stageTransactions(
      ownerUserId,
      runId,
      accountExternalId,
      page,
      nextPage,
      items,
      signal,
    ) {
      await call("stage_banking_page", {
        p_owner_user_id: ownerUserId,
        p_run_id: runId,
        p_kind: "transactions",
        p_account_external_id: accountExternalId,
        p_page: page,
        p_next_page: nextPage,
        p_items: items.map(transactionPayload),
      }, signal);
    },

    async publish(ownerUserId, runId, signal) {
      const data = await call("publish_banking_sync", {
        p_owner_user_id: ownerUserId,
        p_run_id: runId,
      }, signal);
      const parsed = publicationSchema.safeParse(data);
      if (!parsed.success) throw invalidOutput();
      return parsed.data;
    },

    async fail(ownerUserId, runId, code, connectionSucceeded, signal) {
      await call("fail_banking_sync", {
        p_owner_user_id: ownerUserId,
        p_run_id: runId,
        p_error_code: code,
        p_connection_succeeded: connectionSucceeded,
      }, signal);
    },
  };
}
