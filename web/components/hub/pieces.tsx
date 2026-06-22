"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Ms } from "./ms";
import {
  C,
  streamMeta,
  topicChipStyle,
  topicMeta,
} from "@/lib/design";
import { fmtDate } from "@/lib/utils";
import type { Source } from "@/lib/types";

// ── Topic chip ──────────────────────────────────────────────────────────────
export function TopicChip({ topic }: { topic: string | null }) {
  if (!topic) return null;
  return <span style={topicChipStyle(topic)}>{topicMeta(topic).label}</span>;
}

// ── Stream pill (colored, with icon) ────────────────────────────────────────
export function StreamPill({ stream }: { stream: string | null }) {
  const sm = streamMeta(stream);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
        background: sm.color,
      }}
    >
      <Ms name={sm.icon} size={13} color="#fff" />
      {sm.label}
    </span>
  );
}

// ── Direction pill ──────────────────────────────────────────────────────────
export function DirPill({ direction }: { direction: string }) {
  const inbound = direction === "inbound";
  const color = inbound ? C.blue : C.greenDark;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        fontWeight: 600,
        color,
      }}
    >
      <Ms name={inbound ? "south_west" : "north_east"} size={13} color={color} />
      {inbound ? "Inbound" : "Outbound"}
    </span>
  );
}

// ── Citation rendering ──────────────────────────────────────────────────────
function renderCitations(
  para: string,
  active: number | null,
  onCite: (n: number) => void,
): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(para))) {
    if (m.index > last) out.push(<span key={key++}>{para.slice(last, m.index)}</span>);
    const n = parseInt(m[1], 10);
    const on = active === n;
    out.push(
      <sup
        key={key++}
        onClick={() => onCite(n)}
        title={`Jump to source ${n}`}
        style={{
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          minWidth: 17,
          height: 16,
          padding: "0 4px",
          margin: "0 1px",
          borderRadius: 5,
          background: on ? C.blue : C.blueLightest,
          color: on ? "#fff" : C.blue,
          border: `1px solid ${on ? C.blue : C.blueLighter}`,
          fontSize: 10.5,
          fontWeight: 700,
          lineHeight: "14px",
          verticalAlign: "2px",
          cursor: "pointer",
        }}
      >
        {n}
      </sup>,
    );
    last = m.index + m[0].length;
  }
  if (last < para.length) out.push(<span key={key++}>{para.slice(last)}</span>);
  return out;
}

/** Grounded answer body: paragraphs + inline citations; last rag paragraph is the next-step box. */
export function AnswerBody({
  answer,
  isRag,
  activeCite,
  onCite,
}: {
  answer: string;
  isRag: boolean;
  activeCite: number | null;
  onCite: (n: number) => void;
}) {
  const paras = answer
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {paras.map((para, pi) => {
        const isLast = pi === paras.length - 1;
        const nextStep = isRag && isLast && paras.length > 1;
        return (
          <p
            key={pi}
            style={{
              fontSize: 16,
              lineHeight: 1.64,
              color: nextStep ? C.navy : "#26242a",
              margin: 0,
              padding: nextStep ? "14px 16px" : 0,
              background: nextStep ? "#f5f8ff" : "transparent",
              borderRadius: nextStep ? 12 : 0,
              borderLeft: nextStep ? `3px solid ${C.blue}` : "none",
              fontWeight: nextStep ? 500 : 400,
            }}
          >
            {nextStep && (
              <strong
                style={{
                  display: "block",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  color: C.blue,
                  marginBottom: 6,
                  fontWeight: 700,
                }}
              >
                Recommended next step
              </strong>
            )}
            {renderCitations(para, activeCite, onCite)}
          </p>
        );
      })}
    </div>
  );
}

// ── Source card (citation target id="src-N") ────────────────────────────────
export function SourceCard({
  s,
  active,
  onOpenEntity,
}: {
  s: Source;
  active: boolean;
  onOpenEntity?: () => void;
}) {
  const hasEntity = !!onOpenEntity;
  const scorePct = Math.round(s.score * 100);
  const href = `/email?mid=${encodeURIComponent(s.messageId)}`;

  return (
    <div
      id={`src-${s.index}`}
      style={{
        position: "relative",
        background: active ? "#fbfcff" : "#fff",
        border: `1px solid ${active ? C.blue : C.line}`,
        borderRadius: 14,
        padding: "16px 17px",
        transition: "border-color .2s, box-shadow .2s",
        boxShadow: active ? "0 0 0 3px rgba(10,102,255,.15)" : undefined,
        scrollMarginTop: 150,
      }}
    >
      {/* The whole card is a hyperlink to the full email document (new tab). */}
      <Link
        href={href}
        target="_blank"
        aria-label={`Open full email: ${s.subject || "email"}`}
        style={{ position: "absolute", inset: 0, zIndex: 1, borderRadius: 14 }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 9,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 6,
            background: C.blueLightest,
            color: C.blue,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {s.index}
        </span>
        <StreamPill stream={s.stream} />
        <DirPill direction={s.direction} />
        <span style={{ flex: 1 }} />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            color: C.navy,
          }}
        >
          <span
            style={{
              width: 34,
              height: 5,
              borderRadius: 3,
              background: "rgba(10,102,255,.15)",
              overflow: "hidden",
              display: "inline-block",
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                background: C.blue,
                width: `${scorePct}%`,
              }}
            />
          </span>
          {s.score.toFixed(2)}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>
          {s.subject || "(no subject)"}
        </span>
        <TopicChip topic={s.topic} />
      </div>

      <button
        onClick={hasEntity ? onOpenEntity : undefined}
        style={{
          position: "relative",
          zIndex: hasEntity ? 2 : undefined,
          background: "none",
          border: 0,
          padding: 0,
          fontSize: 12.5,
          color: hasEntity ? C.blue : C.muted,
          cursor: hasEntity ? "pointer" : "default",
          textAlign: "left",
        }}
      >
        {s.fromName || "Unknown sender"}
        {s.fromEmail ? ` <${s.fromEmail}>` : ""} · {fmtDate(s.date)}
      </button>

      <p style={{ fontSize: 13.5, lineHeight: 1.5, color: C.ink2, margin: "8px 0 0" }}>
        {s.snippet}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 11,
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: C.blue }}>
          <Ms name="open_in_new" size={14} color={C.blue} />
          Open full email
        </span>
        {hasEntity && (
          <button
            onClick={onOpenEntity}
            style={{
              position: "relative",
              zIndex: 2,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              background: "none",
              border: 0,
              color: C.blue,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            single pane
            <Ms name="north_east" size={13} color={C.blue} />
          </button>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted3 }}>
          <Ms name="tag" size={12} color={C.muted3} />
          {s.messageId}
        </span>
      </div>
    </div>
  );
}

// ── Shimmer block (loading) ─────────────────────────────────────────────────
export function Shim({
  w = "100%",
  h = 13,
  mb = 0,
}: {
  w?: number | string;
  h?: number;
  mb?: number;
}) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        marginBottom: mb,
        background:
          "linear-gradient(90deg,#eef1f5 25%,#f6f8fb 50%,#eef1f5 75%)",
        backgroundSize: "200% 100%",
        animation: "vkbShimmer 1.3s linear infinite",
        display: "block",
      }}
    />
  );
}
