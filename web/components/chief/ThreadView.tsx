"use client";
/*
 * ThreadView — the source document, INSIDE the app shell (Phase 4). Replaces
 * the light-theme standalone /email page as the way citations resolve: same
 * tokens/theme as everything else, wherever it's mounted (desktop right
 * panel, mobile sheet, or the /email deep-link page).
 *
 * Actions (per the rebuild spec):
 *   - Draft reply → if the Constituent Agent already drafted one for this
 *     message, deep-link to the Queue; otherwise state honestly that live
 *     drafting lands with agent runs (Phase 5). Never a dead button.
 *   - View sender in History + inline entity chips → the entity page, but
 *     only for names the record actually resolves (no 404 taps).
 */
import { useEffect, useState } from "react";
import { C, FONT, card, cite } from "@/lib/cos-design";
import type { EmailDetail } from "@/lib/types";
import type { QueueItem } from "@/lib/queue";
import type { EntityListItem } from "@/lib/screens";

interface Props {
  mid: string;
  onOpenHistory?: (name: string) => void;
  onGoQueue?: () => void;
}

export default function ThreadView({ mid, onOpenHistory, onGoQueue }: Props) {
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [queueMatch, setQueueMatch] = useState<QueueItem | null>(null);
  const [entities, setEntities] = useState<EntityListItem[]>([]);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setFailed(false);
    fetch(`/api/email?mid=${encodeURIComponent(mid)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setDetail(d))
      .catch(() => live && setFailed(true));
    fetch("/api/queue")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((q: { items: QueueItem[] }) => {
        if (live) setQueueMatch(q.items.find((i) => i.citations.some((c) => c.messageId === mid)) ?? null);
      })
      .catch(() => { /* queue optional here */ });
    fetch("/api/memory")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { entities?: EntityListItem[] }) => live && setEntities(d.entities ?? []))
      .catch(() => { /* chips optional */ });
    return () => { live = false; };
  }, [mid]);

  if (failed) return <div style={{ padding: 26, textAlign: "center", color: C.dim, fontSize: 13.5 }}>That document could not be found.</div>;
  if (!detail) return <div style={{ padding: 26, textAlign: "center", color: C.dim, fontSize: 13.5 }}>Opening the source document…</div>;

  // entity chips: names the record resolves that actually appear in this message
  const hay = `${detail.fromName ?? ""} ${detail.subject ?? ""} ${detail.bodyClean ?? ""}`.toLowerCase();
  const mentioned = entities.filter((e) => hay.includes(e.name.toLowerCase())).slice(0, 4);
  const senderEntity = detail.fromName
    ? entities.find((e) => e.name.toLowerCase() === detail.fromName!.toLowerCase())
    : undefined;

  return (
    <div style={{ padding: "0 2px 8px" }}>
      <div style={{ ...card, padding: 14, marginBottom: 14 }}>
        <Row k="From" v={`${detail.fromName ?? ""}${detail.fromEmail ? ` · ${detail.fromEmail}` : ""}`} />
        <Row k="To" v={detail.toEmail} />
        {detail.cc && <Row k="Cc" v={detail.cc} />}
        <Row k="Date" v={new Date(detail.date).toLocaleString()} />
        <Row k="Stream" v={`${detail.stream}${detail.topic ? ` · ${detail.topic}` : ""}`} />
      </div>

      <div style={{ fontFamily: FONT.serif, fontSize: 21, fontWeight: 500, lineHeight: 1.3, marginBottom: 10 }}>
        {detail.subject || "(no subject)"}
      </div>

      {onOpenHistory && (senderEntity || mentioned.length > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {senderEntity && onOpenHistory && (
            <button onClick={() => onOpenHistory(senderEntity.name)} style={{ ...cite, border: 0, cursor: "pointer" }}>
              {senderEntity.name} · History ↗
            </button>
          )}
          {mentioned
            .filter((e) => e.name !== senderEntity?.name)
            .map((e) => (
              <button key={e.entityId} onClick={() => onOpenHistory?.(e.name)} style={{ ...cite, border: 0, cursor: "pointer" }}>
                {e.name} ↗
              </button>
            ))}
        </div>
      )}

      {/* the reply path — never a dead end, never a lie */}
      {queueMatch && onGoQueue ? (
        <button onClick={onGoQueue} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", cursor: "pointer", border: 0, borderRadius: 12, padding: "12px 15px", marginBottom: 14, fontWeight: 800, fontSize: 13.5, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322", textAlign: "left" }}>
          A reply is drafted and waiting — open your Queue →
        </button>
      ) : (
        <div style={{ padding: "9px 13px", borderRadius: 11, marginBottom: 14, fontSize: 11.5, fontFamily: FONT.mono, color: C.dim, background: "rgba(var(--ink),.045)", border: `1px solid ${C.line}` }}>
          No draft yet — live drafting arrives with agent runs (Phase 5).
        </div>
      )}

      <div style={{ fontSize: 15, lineHeight: 1.7, color: C.text2, whiteSpace: "pre-wrap" }}>
        {detail.bodyRaw || detail.bodyClean}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 13 }}>
      <span style={{ flex: "0 0 48px", fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, textTransform: "uppercase", paddingTop: 2 }}>{k}</span>
      <span style={{ flex: 1, color: C.text2, minWidth: 0 }}>{v}</span>
    </div>
  );
}
