"use client";
/*
 * QueueScreen — ACT. Every waiting decision, cleared in under five minutes,
 * resumable when interrupted (invariant 7: position/revisions/skips persist in
 * localStorage via lib/queue-state).
 *
 * Mobile: one card at a time, three thumb-reachable actions. Desktop: list +
 * detail. The card always carries the FULL draft body (invariant 6) — on
 * mobile a long body starts collapsed and Approve stays disabled until it has
 * been expanded once.
 *
 *   Approve & send → optimistic, 15s undo toast; on expiry the decision is
 *                    recorded via the existing /api/approvals route (demo
 *                    fake-send). Confirmed sends drop from the queue.
 *   Fix it         → typed or spoken note (existing /api/transcribe; iOS
 *                    records audio/mp4 — filename ext must match the MIME).
 *                    Demo: the note is appended to the draft as a visible
 *                    "Mayor's revision note" and the card returns to the top
 *                    labeled "revised" after a simulated pass. (The live
 *                    re-draft loop lands behind a flag, post-P3.)
 *   Skip           → bottom of the queue. Never deleted.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { C, FONT, card, cite, eyebrow } from "@/lib/cos-design";
import type { QueueItem } from "@/lib/queue";
import SendLivePill from "./SendLivePill";
import {
  loadQueueLocal, saveQueueLocal, orderQueue, newSinceLastVisit, itemState,
  approveItem, restoreItem, skipItem, startRevision, completeRevision,
  type QueueLocal, type ItemState,
} from "@/lib/queue-state";
import { AgentChip } from "./AgentBadge";
import { logUsage } from "@/lib/usage";

interface Props {
  variant: "mobile" | "desktop";
  onOpenEmail?: (mid: string) => void;
}

const URGENCY_C: Record<string, string> = { red: C.red, yellow: C.orange, clear: C.green };
const UNDO_MS = 15000;
const COLLAPSE_OVER = 480; // chars — shorter bodies render fully, no gate

/** Filename extension for a recorded audio blob — OpenAI infers format from it,
 *  so it MUST match the real MIME (iOS Safari records audio/mp4, not webm). */
function audioExt(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mpga")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export default function QueueScreen({ variant, onOpenEmail }: Props) {
  const mobile = variant === "mobile";
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [local, setLocal] = useState<QueueLocal | null>(null);
  const [wywo, setWywo] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fixing, setFixing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [recState, setRecState] = useState<"idle" | "rec" | "busy">("idle");
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; prev: ItemState; until: number } | null>(null);
  const [sendLive, setSendLive] = useState(false); // cage armed → warning pill
  const [, setTick] = useState(0); // toast countdown repaint
  const [sel, setSel] = useState<string | null>(null); // desktop selection
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);

  const update = (l: QueueLocal) => { setLocal(l); saveQueueLocal(l); };

  useEffect(() => {
    const l = loadQueueLocal();
    fetch("/api/queue")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { items: QueueItem[]; sendLive?: boolean }) => {
        setSendLive(!!d.sendLive);
        itemsRef.current = d.items;
        const ids = d.items.map((i) => i.id);
        setWywo(newSinceLastVisit(ids, l.lastSeenIds));
        const nl = { ...l, lastSeenIds: ids };
        saveQueueLocal(nl);
        setLocal(nl);
        setItems(d.items);
        // resume any revision pass that a refresh interrupted (invariant 7)
        for (const id of ids) {
          if ((nl.states[id]?.state ?? "pending") === "revising") {
            window.setTimeout(() => {
              setLocal((cur) => {
                const next = completeRevision(cur ?? loadQueueLocal(), id);
                saveQueueLocal(next);
                return next;
              });
            }, 1500);
          }
        }
      })
      .catch(() => setFailed(true));
  }, []);

  // adoption metric #2: queue-clear duration — from the first render with live
  // work to the moment nothing is pending/revising anymore. Fires once a visit.
  const clearClock = useRef<{ start: number; items: number } | null>(null);
  useEffect(() => {
    if (!items || !local) return;
    const liveCount = items.filter((i) => {
      const s = itemState(local, i.id).state;
      return s === "pending" || s === "revising";
    }).length;
    if (liveCount > 0 && !clearClock.current) {
      clearClock.current = { start: Date.now(), items: liveCount };
    } else if (liveCount === 0 && clearClock.current && clearClock.current.start > 0) {
      logUsage("queue_clear", { ms: Date.now() - clearClock.current.start, items: clearClock.current.items });
      clearClock.current = { start: -1, items: 0 };
    }
  }, [items, local]);

  // toast countdown → on expiry, record the decision (demo fake-send)
  useEffect(() => {
    if (!toast) return;
    const iv = window.setInterval(() => {
      setTick((t) => t + 1);
      if (Date.now() >= toast.until) fireApproval(toast.id);
    }, 500);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const fireApproval = (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.draftId) {
      fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", draftId: item.draftId }),
      }).catch(() => { /* demo: local state already reflects the decision */ });
    }
    setToast((t) => (t?.id === id ? null : t));
  };

  const approve = (id: string) => {
    if (!local) return;
    if (toast) fireApproval(toast.id); // one undo window at a time
    const prev = itemState(local, id);
    update(approveItem(local, id));
    setToast({ id, prev, until: Date.now() + UNDO_MS });
    setFixing(null);
  };
  const undo = () => {
    if (!toast || !local) return;
    update(restoreItem(local, toast.id, toast.prev));
    setToast(null);
  };
  const skip = (id: string) => {
    if (!local) return;
    update(skipItem(local, id));
    setFixing(null);
  };
  const submitFix = (id: string) => {
    const n = note.trim();
    if (!n || !local) return;
    logUsage("fixit_used", { id }); // adoption metric #3
    update(startRevision(local, id, n));
    setFixing(null);
    setNote("");
    window.setTimeout(() => {
      setLocal((cur) => {
        const next = completeRevision(cur ?? loadQueueLocal(), id);
        saveQueueLocal(next);
        return next;
      });
    }, 1800);
  };

  async function toggleMic() {
    if (recState === "rec") { mediaRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecState("busy");
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const fd = new FormData();
          fd.append("audio", blob, `note.${audioExt(rec.mimeType || "")}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          const d = await r.json().catch(() => ({} as { text?: string; empty?: boolean; error?: string }));
          if (r.status === 503) setVoiceErr("Voice needs the OpenAI key — type the note instead.");
          else if (d.text) setNote((n) => (n ? `${n} ` : "") + d.text);
          else if (d.empty) setVoiceErr("Didn't catch any speech — try again.");
          else if (!r.ok) setVoiceErr(d.error || "Transcription failed.");
        } finally {
          setRecState("idle");
        }
      };
      rec.start();
      setRecState("rec");
      setVoiceErr(null);
    } catch {
      setVoiceErr("Microphone unavailable.");
    }
  }

  if (failed) return <Shell mobile={mobile}><Empty text="Couldn't load the queue. Pull to refresh." /></Shell>;
  if (!items || !local) return <Shell mobile={mobile}><Empty text="…" /></Shell>;

  const ordered = orderQueue(items, local);
  const live = ordered.filter((i) => itemState(local, i.id).state !== "skipped");
  const skipped = ordered.length - live.length;

  if (ordered.length === 0) {
    return (
      <Shell mobile={mobile}>
        <div style={{ ...card, padding: 34, textAlign: "center" }}>
          <div style={{ fontFamily: FONT.serif, fontSize: 21, color: C.text }}>Queue clear. Nothing needs you.</div>
        </div>
      </Shell>
    );
  }

  const current = mobile ? ordered[0] : (ordered.find((i) => i.id === sel) ?? ordered[0]);

  const renderCard = (item: QueueItem) => {
    const st = itemState(local, item.id);
    const isLong = item.fullBody.length > COLLAPSE_OVER;
    const isOpen = !mobile || !isLong || expanded.has(item.id);
    const canApprove = isOpen && st.state !== "revising";
    return (
      <div style={{ ...card, padding: mobile ? 16 : 20, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* header: urgency + state + provenance */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: URGENCY_C[item.urgency], flexShrink: 0 }} />
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, letterSpacing: ".06em", textTransform: "uppercase" }}>{item.urgency}</span>
          {st.revised && <span style={revisedPill}>revised</span>}
          {st.state === "skipped" && <span style={skippedPill}>skipped</span>}
          {st.state === "revising" && <span style={revisedPill}>revising…</span>}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AgentChip agentKey={item.agentKey} label={`drafted by ${item.agentName.replace(/ Agent$/, "")}`} />
            <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>· never auto-sent</span>
          </span>
        </div>

        <div>
          <div style={{ fontSize: 12, color: C.muted }}>To: <span style={{ color: C.text2, fontWeight: 600 }}>{item.to}</span></div>
          <div style={{ fontSize: mobile ? 15 : 16.5, fontWeight: 700, color: C.text, lineHeight: 1.3, marginTop: 4 }}>{item.subject}</div>
        </div>

        {/* FULL body — never truncated on an approve surface. Mobile: long
            bodies start collapsed; Approve unlocks after one expansion. */}
        <div style={{ position: "relative" }}>
          <div className="scrl" style={{ fontSize: 15, color: C.text2, lineHeight: 1.62, whiteSpace: "pre-wrap", fontFamily: FONT.serif, maxHeight: isOpen ? (mobile ? "44dvh" : 380) : 150, overflowY: isOpen ? "auto" : "hidden" }}>
            {item.fullBody}
          </div>
          {!isOpen && (
            <button onClick={() => setExpanded((s) => new Set(s).add(item.id))} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, border: 0, cursor: "pointer", background: "linear-gradient(180deg, transparent 30%, var(--c-appbg) 92%)", color: C.gold, fontWeight: 800, fontSize: 13, fontFamily: FONT.sans }}>
              Read full draft ▾
            </button>
          )}
        </div>

        {st.revision && (
          <div style={{ borderLeft: `2px solid ${C.gold}`, paddingLeft: 11 }}>
            <div style={{ ...eyebrow(C.goldHi), fontSize: 9.5 }}>Mayor&apos;s revision note</div>
            <div style={{ fontSize: 13, color: C.text2, marginTop: 4, fontStyle: "italic" }}>{st.revision}</div>
          </div>
        )}

        <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.5, fontStyle: "italic", borderLeft: "2px solid rgba(157,139,255,.4)", paddingLeft: 11 }}>{item.rationale}</div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {item.citations.map((s) => (
            <button key={s.messageId} onClick={() => onOpenEmail?.(s.messageId)} style={{ ...cite, border: 0, cursor: "pointer" }}>{s.label} ↗</button>
          ))}
        </div>

        {/* fix-it note */}
        {fixing === item.id ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What should change? Speak or type — e.g. “Firmer on the date. Have DiMeo call her.”"
              rows={3}
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "rgba(var(--ink),.05)", border: `1px solid ${C.line}`, borderRadius: 11, padding: "10px 12px", color: C.text, fontSize: 13.5, fontFamily: FONT.sans }}
            />
            {voiceErr && <div style={{ fontSize: 11.5, color: C.orangeText }}>{voiceErr}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={toggleMic} aria-label="Dictate the note" style={{ ...btnGhostS, width: 46, color: recState === "rec" ? C.redText : C.text2, borderColor: recState === "rec" ? C.red : C.line, animation: recState === "rec" ? "bwPulse 1.2s ease-in-out infinite" : undefined }}>
                {recState === "busy" ? "…" : "🎙"}
              </button>
              <button onClick={() => submitFix(item.id)} disabled={!note.trim()} style={{ ...btnGoldS, flex: 1, opacity: note.trim() ? 1 : 0.45 }}>Send for revision</button>
              <button onClick={() => { setFixing(null); setNote(""); }} style={btnGhostS}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 9, marginTop: 2 }}>
            <button onClick={() => skip(item.id)} style={btnGhostS}>Skip</button>
            <button onClick={() => { setFixing(item.id); setNote(st.revision ?? ""); setVoiceErr(null); }} style={{ ...btnGhostS, flex: 1 }} disabled={st.state === "revising"}>Fix it</button>
            <button onClick={() => approve(item.id)} disabled={!canApprove} title={canApprove ? undefined : "Read the full draft first"} style={{ ...btnGoldS, flex: 1.6, opacity: canApprove ? 1 : 0.45 }}>
              Approve &amp; send
            </button>
          </div>
        )}
        {!isOpen && <div style={{ fontSize: 10.5, color: C.dim, textAlign: "right", fontFamily: FONT.mono }}>read the full draft to approve</div>}
      </div>
    );
  };

  return (
    <Shell mobile={mobile}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: sendLive ? 8 : 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "'Public Sans','Inter',system-ui,sans-serif", fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-.01em" }}>The queue</div>
        <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.muted }}>
          {live.length} to clear{skipped > 0 && ` · ${skipped} skipped`}
        </span>
      </div>
      {sendLive && <div style={{ marginBottom: 12 }}><SendLivePill /></div>}

      {wywo > 0 && (
        <div style={{ ...card, padding: "10px 14px", marginBottom: 12, fontSize: 12.5, color: C.text2 }}>
          While you were out: <b>{wywo} new item{wywo === 1 ? "" : "s"}</b> joined the queue.
        </div>
      )}

      {mobile ? (
        renderCard(current)
      ) : (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {ordered.map((i) => {
              const st = itemState(local, i.id);
              const on = i.id === current.id;
              return (
                <button key={i.id} onClick={() => setSel(i.id)} style={{ ...card, textAlign: "left", cursor: "pointer", padding: "11px 13px", display: "flex", gap: 10, alignItems: "center", outline: on ? `2px solid ${C.gold}` : undefined, color: C.text, fontFamily: FONT.sans }}>
                  <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: URGENCY_C[i.urgency] }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.subject}</span>
                    <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2 }}>{i.to}</span>
                  </span>
                  {st.revised && <span style={revisedPill}>revised</span>}
                  {st.state === "skipped" && <span style={skippedPill}>skipped</span>}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1.7, minWidth: 0 }}>{renderCard(current)}</div>
        </div>
      )}

      {/* undo toast */}
      {toast && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: mobile ? "calc(104px + env(safe-area-inset-bottom))" : 96, zIndex: 70, display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderRadius: 12, background: "rgba(10,19,34,.92)", border: "1px solid rgba(255,255,255,.14)", color: "#e8edf6", boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>
          <span style={{ fontSize: 12.5 }}>Approved — sending in {Math.max(0, Math.ceil((toast.until - Date.now()) / 1000))}s</span>
          <button onClick={undo} style={{ background: "none", border: 0, color: "#F4CB63", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: FONT.sans }}>Undo</button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ mobile, children }: { mobile: boolean; children: React.ReactNode }) {
  return <div style={{ maxWidth: mobile ? 760 : 1080, margin: "0 auto", padding: mobile ? "8px 16px 28px" : "26px 32px 40px" }}>{children}</div>;
}
function Empty({ text }: { text: string }) {
  return <div style={{ ...card, padding: 26, textAlign: "center", color: C.dim, fontSize: 13.5 }}>{text}</div>;
}

const btnGoldS: CSSProperties = { cursor: "pointer", border: 0, borderRadius: 11, padding: "12px 14px", fontWeight: 800, fontSize: 13.5, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" };
const btnGhostS: CSSProperties = { cursor: "pointer", borderRadius: 11, padding: "12px 14px", fontWeight: 700, fontSize: 13, fontFamily: FONT.sans, background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, color: C.text2 };
const revisedPill: CSSProperties = { padding: "2px 8px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: ".06em", fontFamily: FONT.mono, textTransform: "uppercase", color: C.goldHi, background: "rgba(231,181,60,.14)", border: "1px solid rgba(231,181,60,.3)" };
const skippedPill: CSSProperties = { padding: "2px 8px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: ".06em", fontFamily: FONT.mono, textTransform: "uppercase", color: C.muted, background: "rgba(var(--ink),.07)", border: `1px solid ${C.line}` };
