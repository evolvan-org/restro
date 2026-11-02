function diagnosticIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(value)
    ? value
    : undefined;
}

/** Excludes messages, request URLs, payloads, and credentials from best-effort error logs. */
export function errorDiagnostics(error: unknown): Record<string, string | number | undefined> {
  if (typeof error !== 'object' || error === null) return { name: 'UnknownError' };
  const details = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    cause?: unknown;
    error?: unknown;
  };
  const cause = details.cause ?? details.error;
  return {
    name: diagnosticIdentifier(details.name) ?? 'UnknownError',
    code: diagnosticIdentifier(details.code),
    status: typeof details.status === 'number' ? details.status : undefined,
    causeCode:
      typeof cause === 'object' && cause !== null && 'code' in cause
        ? diagnosticIdentifier(cause.code)
        : undefined,
  };
}
