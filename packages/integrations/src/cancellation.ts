// Race even non-cooperative dependencies, and refuse to start new work after abort.
export async function withCancellation<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  error: () => Error,
): Promise<T> {
  if (signal.aborted) throw error();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(error());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation(), aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
