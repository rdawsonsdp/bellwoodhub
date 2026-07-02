"use client";
/*
 * EmailStandalone — the /email deep-link page body: the shared ThreadView on
 * the app's own theme, with a way back into the Hub. Kept as a thin client
 * wrapper so the route and the in-app panels can never drift apart.
 */
import Link from "next/link";
import ThreadView from "@/components/chief/ThreadView";
import { C, FONT } from "@/lib/cos-design";

export default function EmailStandalone({ mid }: { mid: string }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--c-appbg)", color: C.text, fontFamily: FONT.sans }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "16px 18px 60px" }}>
        <Link href="/chief" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.gold, textDecoration: "none", fontWeight: 800, fontSize: 13.5, padding: "6px 0 14px" }}>
          ← Back to Bellwood Hub
        </Link>
        {mid ? (
          <ThreadView mid={mid} onGoQueue={() => { window.location.href = "/chief"; }} />
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: C.dim, fontSize: 14 }}>No document specified.</div>
        )}
      </div>
    </div>
  );
}
