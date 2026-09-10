export type IntegrationErrorCode =
  | "PROVIDER_AUTH_EXPIRED"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_INVALID_RESPONSE"
  | "SYNC_LOCKED"
  | "DATABASE_ERROR";

const messages: Record<IntegrationErrorCode, string> = {
  PROVIDER_AUTH_EXPIRED: "The provider authentication has expired.",
  PROVIDER_RATE_LIMIT: "The provider rate limit has been reached.",
  PROVIDER_UNAVAILABLE: "The provider is temporarily unavailable.",
  PROVIDER_INVALID_RESPONSE: "The provider returned an invalid response.",
  SYNC_LOCKED: "A synchronization is already running.",
  DATABASE_ERROR: "The database operation failed.",
};

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;

  constructor(code: IntegrationErrorCode) {
    super(messages[code]);
    this.code = code;
  }
}
