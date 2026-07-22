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

/** What went wrong loading the email — surfaced at the TOP of the box, since a
 *  failed connection is exactly where the eye looks first. */
type LoadError = { kind: "notfound" | "connection"; detail: string };

export default function ThreadView({ mid, onOpenHistory, onGoQueue }: Props) {
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [queueMatch, setQueueMatch] = useState<QueueItem | null>(null);
  const [entities, setEntities] = useState<EntityListItem[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setError(null);
    fetch(`/api/email?mid=${encodeURIComponent(mid)}`)
      .then(async (r) => {
        if (r.ok) return r.json();
        // 404 = the message isn't in the record; anything else = the source /
        // hydration connection failed. Both are shown at the top, worded plainly.
        throw { kind: r.status === 404 ? "notfound" : "connection", detail: `The mail source returned ${r.status}.` } as LoadError;
      })
      .then((d) => live && setDetail(d))
      .catch((e: unknown) => {
        if (!live) return;
        // a rejected fetch() (network/DNS/TLS) has no HTTP status — it's a
        // connection failure, the same class as the mail-mirror "fetch failed".
        const le = e && typeof e === "object" && "kind" in e ? (e as LoadError)
          : { kind: "connection" as const, detail: "The connection to the mail source failed." };
        setError(le);
      });
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
  }, [mid, reloadKey]);

  // A failed connection belongs at the TOP of the box — the intuitive place to
  // look — as a clear banner with a way to try again, not a lonely muted line.
  if (error) return (
    <div style={{ padding: "0 2px 8px" }}>
      <div style={{ ...card, padding: 15, borderColor: error.kind === "connection" ? "rgba(224,108,79,.5)" : C.line, background: error.kind === "connection" ? "rgba(224,108,79,.08)" : "rgba(var(--ink),.03)" }}>
        <div style={{ fontFamily: "'Public Sans','Inter',system-ui,sans-serif", fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>
          {error.kind === "connection" ? "Couldn't load this email" : "This email isn't in the record"}
        </div>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
          {error.kind === "connection"
            ? "The connection to the mail source failed. The message is still in your mailbox — try again, or open it in your email."
            : "It may not have been mirrored yet, or it lives in a walled mailbox this view can't reach."}
        </div>
        {error.kind === "connection" && (
          <button onClick={() => setReloadKey((k) => k + 1)} style={{ marginTop: 12, cursor: "pointer", border: 0, borderRadius: 10, padding: "9px 15px", fontWeight: 800, fontSize: 13, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" }}>
            ↻ Try again
          </button>
        )}
      </div>
    </div>
  );
  if (!detail) return <div style={{ padding: 26, textAlign: "center", color: C.dim, fontSize: 13.5 }}>Opening the source document…</div>;

  // The always-present action at the top of the box: open the message in the
  // real mail client (Gmail deep-links by RFC message-id; Outlook opens the
  // mailbox). This is never a dead end — every email has an action.
  const bareId = mid.replace(/^[<\s]+|[>\s]+$/g, "");
  const openUrl =
    detail.provider === "gmail" ? `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(bareId)}`
    : detail.provider === "outlook" ? "https://outlook.office.com/mail/"
    : `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(bareId)}`;
  const providerLabel = detail.provider === "outlook" ? "Outlook" : "Gmail";

  // entity chips: names the record resolves that actually appear in this message
  const hay = `${detail.fromName ?? ""} ${detail.subject ?? ""} ${detail.bodyClean ?? ""}`.toLowerCase();
  const mentioned = entities.filter((e) => hay.includes(e.name.toLowerCase())).slice(0, 4);
  const senderEntity = detail.fromName
    ? entities.find((e) => e.name.toLowerCase() === detail.fromName!.toLowerCase())
    : undefined;

  return (
    <div style={{ padding: "0 2px 8px" }}>
      {/* action bar — every email has an action at the top: reply (if an agent
          drafted one, → the Queue) and open the message in the real mail client */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {queueMatch && onGoQueue && (
          <button onClick={onGoQueue} style={{ cursor: "pointer", border: 0, borderRadius: 10, padding: "9px 15px", fontWeight: 800, fontSize: 13, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" }}>
            Reply — drafted, open Queue →
          </button>
        )}
        <a href={openUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", cursor: "pointer", borderRadius: 10, padding: "9px 15px", fontWeight: 800, fontSize: 13, fontFamily: FONT.sans, border: `1px solid ${C.line}`, background: "rgba(var(--ink),.04)", color: C.text }}>
          Open in {providerLabel} ↗
        </a>
      </div>

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

      <div style={{ fontSize: 15, lineHeight: 1.7, color: C.text2, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
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
      <span style={{ flex: 1, color: C.text2, minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );
}
