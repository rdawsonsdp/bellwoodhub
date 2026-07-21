/*
 * ingest-error.ts — turning a thrown ingest failure into (a) a message that
 * actually says what went wrong and (b) a verdict on whether to retry.
 *
 * WHY THIS EXISTS. A pull can fail two very different ways:
 *   - TRANSIENT: the network dropped mid-backfill — undici throws a TypeError
 *     whose `.message` is the useless "fetch failed" and whose `.cause` holds
 *     the real reason (ENOTFOUND / ECONNRESET / ETIMEDOUT / socket hang up).
 *     Nothing is wrong with the account; the next scheduled pass will succeed.
 *   - AUTH: the refresh token is dead (invalid_grant / 401). No amount of
 *     retrying fixes it — the operator must Reconnect (re-consent).
 *
 * The old code latched EVERY failure to status='error', which the scheduler
 * skips — so a one-second network blip stranded a 12%-done backfill for 15h
 * until someone noticed (observed 2026-07-20). Classifying the error lets the
 * transient case self-heal and reserves the Reconnect prompt for real auth death.
 */

/** Unwrap `fetch failed` to the underlying cause so last_error is diagnosable. */
export function describeIngestError(err: unknown): string {
  if (!(err instanceof Error)) return String(err).slice(0, 500);
  let msg = err.message;
  // undici wraps the socket error in `.cause`; surface its code + message.
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    msg += ` — ${code ? `${code}: ` : ""}${cause.message}`;
  } else if (typeof cause === "string" && cause) {
    msg += ` — ${cause}`;
  }
  return msg.slice(0, 500);
}

/**
 * Does this failure mean the credentials are dead (Reconnect required), rather
 * than a retryable blip? The gmail/graph connectors throw a descriptive
 * `... token refresh <status>: <body>` on HTTP failures, and the loop throws a
 * plain sentence when there's no refresh token on file — those are the auth
 * cases. A bare `fetch failed` (network) is NOT auth: it's transient.
 */
export function isAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid_grant") ||
    m.includes("invalid_client") ||
    m.includes("unauthorized") ||
    m.includes("no refresh token") ||
    m.includes("re-consent") ||
    m.includes("token refresh 400") ||
    m.includes("token refresh 401") ||
    m.includes("token refresh 403")
  );
}

/** Consecutive transient failures tolerated before we escalate to status='error'
 *  and ask for attention. At the 15-min scheduler cadence this is ~90 minutes of
 *  automatic retrying — long enough to ride out an outage, short enough that a
 *  genuinely broken connection still surfaces the same day. */
export const MAX_TRANSIENT_RETRIES = 6;

export interface RetryState { attempts: number; firstAt: string; lastError: string }
