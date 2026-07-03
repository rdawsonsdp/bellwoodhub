/*
 * send-cage.ts — the ONLY gate real mail passes through (GO_LIVE_PLAN L1.7;
 * RD go-decision 2026-07-03). Two locks, both fail-closed:
 *
 *   SEND_ENABLED         — the master switch; anything but "1" means no send.
 *   SAFE_SEND_ALLOWLIST  — comma-separated recipient addresses. "*" opens the
 *                          cage wide (a deliberate, logged operator act —
 *                          ship-default is the operator's own address only).
 *
 * A runaway agent (or a compromised approve path) can therefore only ever
 * email the allowlist. Widening the list is an explicit env change, audited
 * by the deploy that carries it. The human gate stays regardless: nothing
 * reaches this module without an Approve.
 */

export interface CageVerdict {
  allowed: boolean;
  reason: string;
}

export function canSend(recipient: string | null | undefined): CageVerdict {
  if (process.env.SEND_ENABLED !== "1") {
    return { allowed: false, reason: "sending is disabled (SEND_ENABLED is not 1)" };
  }
  const to = (recipient ?? "").trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { allowed: false, reason: "no valid recipient address on the draft" };
  }
  const list = (process.env.SAFE_SEND_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) {
    return { allowed: false, reason: "send allowlist is empty (fail closed)" };
  }
  if (list.includes("*") || list.includes(to)) {
    return { allowed: true, reason: "recipient allowed" };
  }
  return { allowed: false, reason: `recipient ${to} is outside the send allowlist` };
}
