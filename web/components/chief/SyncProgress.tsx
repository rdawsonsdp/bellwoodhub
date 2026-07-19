"use client";
/*
 * SyncProgress — the answer to "is this thing working, and how long?"
 *
 * The Mayor's first sync runs for hours. Without a pace and an end, a long
 * quiet mirror reads as a broken one, and the user's next move is to click
 * things or ask for help. This component exists to make waiting legible: how
 * much is in, how fast it's arriving, how much is left.
 *
 * Three claims, in the order anxiety asks them:
 *   1. HOW FAR — a filled bar against the real mailbox size (asked live from
 *      the provider; never a guess).
 *   2. HOW FAST — messages per minute, trailing 10 minutes, with a 30-minute
 *      bar chart so a stall is visible as a gap rather than a stale number.
 *   3. HOW LONG — remaining ÷ rate, stated as an estimate.
 *
 * Honesty rules, deliberate:
 *   - No denominator (a provider ask failed) → no fake bar. Show the count and
 *     say the total is unknown. A progress bar that isn't measuring anything is
 *     worse than no bar.
 *   - Rate 0 while a backfill is mid-round → "working…", not "stalled". Rounds
 *     take minutes; the gap between them is not a failure.
 *   - Mirrored and searchable are TWO tracks. Mail lands first, embedding
 *     trails it, and search only works on the second. Collapsing them into one
 *     "synced" number is the lie that produces "why can't it find my email?"
 */
import { useEffect, useState } from "react";
import { C, FONT } from "@/lib/cos-design";

export interface SyncProgressData {
  mail: {
    mirrored: number;
    total: number | null;
    remaining: number | null;
    ratePerMin: number | null;
    etaMinutes: number | null;
    history: { minute: string; n: number }[];
  };
  index: { messages: number; indexed: number; remaining: number; etaMinutes: number | null };
}

const fmt = (n: number) => n.toLocaleString();

/** "about 2 hours" reads as an estimate; "103 min" reads as a promise. */
function humanEta(min: number | null): string | null {
  if (!min || min <= 0) return null;
  if (min < 2) return "under a minute";
  if (min < 90) return `about ${min} min`;
  const h = Math.round(min / 60);
  return h <= 1 ? "about an hour" : `about ${h} hours`;
}

/** 30 one-minute bars. Zero minutes render as a floor tick so the gap is
 *  visible — an empty slot would read as "no data", not "nothing arrived". */
function Bars({ history }: { history: { minute: string; n: number }[] }) {
  const peak = Math.max(1, ...history.map((h) => h.n));
  return (
    <div
      aria-hidden
      style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34, marginTop: 10 }}
    >
      {history.map((h) => {
        const pct = h.n / peak;
        return (
          <div
            key={h.minute}
            title={`${h.n} in this minute`}
            style={{
              flex: 1,
              minWidth: 2,
              height: h.n === 0 ? 2 : `${Math.max(8, pct * 100)}%`,
              borderRadius: 2,
              background:
                h.n === 0
                  ? "rgba(var(--ink),.10)"
                  : `linear-gradient(180deg, ${C.goldHi}, ${C.gold})`,
              opacity: h.n === 0 ? 1 : 0.55 + pct * 0.45,
            }}
          />
        );
      })}
    </div>
  );
}

export default function SyncProgress({ data, compact = false }: { data: SyncProgressData; compact?: boolean }) {
  const { mail, index } = data;
  const known = mail.total !== null && mail.total > 0;
  const pct = known ? Math.min(100, Math.round((mail.mirrored / mail.total!) * 100)) : null;
  const done = known && (mail.remaining ?? 0) === 0;
  const eta = humanEta(mail.etaMinutes);

  // Searchable trails mirrored; it is the number that decides whether an agent
  // can find anything, so it gets its own track rather than a footnote.
  const idxPct = index.messages > 0 ? Math.round((index.indexed / index.messages) * 100) : 0;

  const rateLabel =
    done ? "up to date"
    : mail.ratePerMin && mail.ratePerMin > 0 ? `${fmt(mail.ratePerMin)} emails/min`
    : "working…"; // mid-round quiet, not a stall

  return (
    <div
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: compact ? 13 : 16,
        background: "rgba(var(--ink),.03)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT.serif, fontSize: compact ? 15 : 17, fontWeight: 700, color: C.text }}>
          {done ? "Mailbox mirrored" : "Bringing in your mail"}
        </span>
        <span style={{ fontSize: 12.5, color: C.text2 }}>
          {known ? (
            <>
              <b style={{ color: C.text }}>{fmt(mail.mirrored)}</b> of {fmt(mail.total!)}
              {pct !== null && <> · {pct}%</>}
            </>
          ) : (
            <>
              <b style={{ color: C.text }}>{fmt(mail.mirrored)}</b> emails in so far
            </>
          )}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 11, color: C.text3 }}>
          {rateLabel}
          {eta && !done && <> · {eta} left</>}
        </span>
      </div>

      {/* HOW FAR — only when there is a real denominator to measure against. */}
      {known ? (
        <div
          style={{
            marginTop: 10, height: 8, borderRadius: 99,
            background: "rgba(var(--ink),.08)", overflow: "hidden",
          }}
          role="progressbar"
          aria-valuenow={pct ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Mail mirrored"
        >
          <div
            style={{
              width: `${pct}%`, height: "100%", borderRadius: 99,
              background: `linear-gradient(90deg, ${C.goldLo}, ${C.goldHi})`,
              transition: "width .6s ease",
            }}
          />
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11.5, color: C.text3 }}>
          Mailbox size unavailable right now — the count above is live, the total isn&rsquo;t.
        </div>
      )}

      {/* HOW FAST — the last 30 minutes, one bar per minute. */}
      {mail.history.length > 0 && <Bars history={mail.history} />}

      {/* The second track: searchable ≠ mirrored. */}
      <div
        style={{
          marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.line}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12.5, color: C.text2 }}>
          Searchable: <b style={{ color: C.text }}>{fmt(index.indexed)}</b> of {fmt(index.messages)}
          {index.messages > 0 && <> · {idxPct}%</>}
        </span>
        <div
          style={{
            flex: 1, minWidth: 90, height: 5, borderRadius: 99,
            background: "rgba(var(--ink),.08)", overflow: "hidden",
          }}
        >
          <div style={{ width: `${idxPct}%`, height: "100%", background: C.gold, opacity: 0.75, transition: "width .6s ease" }} />
        </div>
        {index.remaining > 0 && (
          <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.text3 }}>
            {fmt(index.remaining)} to index
            {humanEta(index.etaMinutes) && <> · {humanEta(index.etaMinutes)}</>}
          </span>
        )}
      </div>

      {index.remaining > 0 && (
        <div style={{ marginTop: 7, fontSize: 11.5, color: C.text3, lineHeight: 1.5 }}>
          Mail arrives first and becomes searchable a little after — agents and search
          only see the indexed portion.
        </div>
      )}
    </div>
  );
}

/**
 * Self-fetching wrapper — one line to mount anywhere.
 *
 * Renders NOTHING once everything is caught up. A permanent "100% synced" panel
 * is furniture; this only earns space while the user has something to wait for.
 * Polls with `?totals=0` so the 15s refresh never re-asks the provider for the
 * mailbox size (that ask is slow and rate-limited) — the denominator comes from
 * the first load and is carried forward.
 */
export function SyncProgressCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<SyncProgressData | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async (first: boolean) => {
      try {
        const r = await fetch(`/api/sync/status${first ? "" : "?totals=0"}`);
        if (!r.ok) return;
        const j = (await r.json()) as Partial<SyncProgressData>;
        if (!alive || !j.mail || !j.index) return;
        setData((prev) => ({
          index: j.index!,
          // carry the first load's denominator through the cheap polls
          mail: { ...j.mail!, total: j.mail!.total ?? prev?.mail.total ?? null },
        }));
      } catch {
        /* a failed poll keeps the last good frame rather than blanking */
      } finally {
        if (alive) timer = setTimeout(() => tick(false), 15_000);
      }
    };

    tick(true);
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  if (!data) return null;
  const settled = (data.mail.remaining ?? 0) === 0 && data.index.remaining === 0;
  if (settled) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <SyncProgress data={data} compact={compact} />
    </div>
  );
}
