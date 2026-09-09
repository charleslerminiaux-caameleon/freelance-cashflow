export class RepositoryError extends Error {
  constructor(readonly code: string) {
    super("Commercial database operation failed");
    this.name = "RepositoryError";
  }
}

export function repositoryError(error: { code?: string; message?: string }): RepositoryError {
  const stableMessage = error.message?.match(/FC_[A-Z_]+/)?.[0];
  return new RepositoryError(stableMessage ?? error.code ?? "DATABASE_ERROR");
}
