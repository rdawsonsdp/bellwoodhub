"use client";
/*
 * SendLivePill — the cage-state banner (RD 2026-07-05: "we should have some
 * flashing label that says send is enabled"). When the pilot's send cage is
 * armed (SEND_ENABLED=1), tapping Approve REALLY transmits — this pill says
 * so, pulsing, on every surface where mail is decided or watched (Wall hero,
 * Queue, Approvals). Each surface learns the state from its own single API
 * call; the pill itself is pure display. Absent = sending disabled.
 */
import type { CSSProperties } from "react";
import { FONT } from "@/lib/cos-design";

export default function SendLivePill({ style }: { style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 11px",
        borderRadius: 99, background: "rgba(240,120,40,.14)", border: "1px solid rgba(240,120,40,.5)",
        color: "#f0a33c", fontFamily: FONT.mono, fontSize: 10, fontWeight: 800,
        letterSpacing: ".07em", textTransform: "uppercase", whiteSpace: "nowrap",
        animation: "bwPulse 1.6s ease-in-out infinite",
        ...style,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor", flexShrink: 0 }} />
      Live send on — Approve really sends
    </span>
  );
}
