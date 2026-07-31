"use client";
/*
 * AnswerMd — formats an Ask synthesis (markdown subset) as real content
 * instead of raw markup (RD 2026-07-05). Hand-rolled: no dependency, no
 * dangerouslySetInnerHTML — every node is built as React elements.
 *
 * Covers what the synthesizer emits: #–#### headings, **bold**, *italic*,
 * `inline code`, ``` fenced code, [text](url) links, "- " bullets, "1." ordered
 * lists, | pipe | tables |, --- rules, "> " callouts, and [n] citations, which
 * stay the tappable chips that scroll to the matching source card (ids
 * `src-<n>`, same contract as before).
 *
 * Anything that can be wide — tables and code — scrolls inside ITS OWN box.
 * The page body must never scroll horizontally: on a phone an overflowing child
 * widens the layout viewport and every 100%-width element above it renders at a
 * fraction of the screen (RD 2026-07-30).
 */
import type { CSSProperties, ReactNode } from "react";
import { C, FONT, card, cite } from "@/lib/cos-design";

function citeChip(n: string, key: string): ReactNode {
  return (
    <button
      key={key}
      onClick={() => document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      style={{ ...cite, cursor: "pointer", border: 0, fontWeight: 700, verticalAlign: "baseline" }}
    >
      [{n}]
    </button>
  );
}

const codeInline: CSSProperties = {
  fontFamily: FONT.mono, fontSize: "0.88em", padding: "1.5px 5px", borderRadius: 5,
  background: "rgba(var(--ink),.07)", border: `1px solid ${C.line2}`, overflowWrap: "anywhere",
};

/** Inline pass: `code`, **bold**, [text](url) links, [n] chips, *italic*.
 *  Order matters — `code` first so markup inside it stays literal, and the link
 *  alternative before the [n] citation so "[a](b)" is not mistaken for a chip
 *  (the citation branch is digits-only, so the two cannot collide). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`|\*\*[^*]+\*\*|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|\[(\d+)\]|\*[^*\n]+\*)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) out.push(<code key={key} style={codeInline}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<b key={key} style={{ fontWeight: 700, color: C.text }}>{tok.slice(2, -2)}</b>);
    else if (m[2] != null && m[3] != null) out.push(
      <a key={key} href={m[3]} target="_blank" rel="noopener noreferrer"
        style={{ color: C.gold, textDecoration: "underline", overflowWrap: "anywhere" }}>{m[2]}</a>,
    );
    else if (m[4] != null) out.push(citeChip(m[4], key));
    else out.push(<i key={key}>{tok.slice(1, -1)}</i>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableRule = (l: string) => /^\s*\|?[\s|:-]+\|?\s*$/.test(l) && l.includes("-");
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export default function AnswerMd({ text, size = 15.5 }: { text: string; size?: number }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let k = 0;
  // Body copy is SANS. The serif is the brand voice and stays on headings, but a
  // dense multi-paragraph answer set in serif at 15–17px is tiring to read — and
  // ~80% of use is on a phone, where the serif's thin strokes lose contrast
  // against the warm paper background (RD 2026-07-18: "this font isn't easy to
  // read"). Line-height is generous for the same reason.
  const body: CSSProperties = {
    fontFamily: FONT.sans,
    fontSize: size - 1,
    lineHeight: 1.68,
    color: C.text,
    letterSpacing: ".002em",
    // Long unbroken tokens — invoice numbers (#PBYJGJ-00024), project ids,
    // urls — must wrap instead of pushing the column wider than the phone.
    overflowWrap: "anywhere",
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;

    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      blocks.push(
        <div key={key} style={{ fontFamily: FONT.serif, fontWeight: 700, color: C.text, fontSize: size + (5 - level) * 1.6, lineHeight: 1.3, margin: `${blocks.length ? 14 : 0}px 0 6px` }}>
          {inline(h[2], key)}
        </div>,
      );
      i++; continue;
    }

    // "> " callout — what actually needs the Mayor. The synthesizer emits these
    // first and only for real action items (deadline, threat, unanswered ask,
    // a decision only he can make), so they get amber weight rather than
    // reading like one more paragraph. Consecutive "> " lines group into one card.
    if (/^>\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^>\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^>\s+/, ""));
        i++;
      }
      blocks.push(
        <div key={key} style={{ margin: "4px 0 14px", borderLeft: `3px solid ${C.gold}`, background: "rgba(231,181,60,.10)", borderRadius: "0 12px 12px 0", padding: "11px 13px", display: "grid", gap: 7, overflowWrap: "anywhere" }}>
          <div style={{ fontFamily: FONT.mono, fontSize: size - 6, letterSpacing: ".08em", textTransform: "uppercase", color: C.goldHi, fontWeight: 700 }}>
            Needs you
          </div>
          {items.map((t, ii) => (
            <div key={ii} style={{ ...body, fontSize: size - 0.5, display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span aria-hidden style={{ color: C.gold, fontWeight: 700, lineHeight: 1.62 }}>&#8226;</span>
              <span>{inline(t, `${key}-${ii}`)}</span>
            </div>
          ))}
        </div>,
      );
      continue;
    }

    if (/^-{3,}\s*$/.test(line)) {
      blocks.push(<div key={key} style={{ borderTop: `1px solid ${C.line2}`, margin: "12px 0" }} />);
      i++; continue;
    }

    // "? " clarifying question — the synthesizer asks back rather than guessing
    // at an unrecognised vendor/person/account (RD 2026-07-30). Rendered as a
    // distinct prompt so it reads as a question TO the user, not as an answer.
    if (/^\?\s+/.test(line)) {
      const q = line.replace(/^\?\s+/, "");
      blocks.push(
        <div key={key} style={{ margin: "12px 0 6px", border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.blue ?? C.gold}`, borderRadius: "0 12px 12px 0", padding: "11px 13px", display: "grid", gap: 6, overflowWrap: "anywhere" }}>
          <div style={{ fontFamily: FONT.mono, fontSize: size - 6, letterSpacing: ".08em", textTransform: "uppercase", color: C.dim, fontWeight: 700 }}>
            One thing to confirm
          </div>
          <div style={{ ...body, fontSize: size - 0.5 }}>{inline(q, key)}</div>
        </div>,
      );
      i++; continue;
    }

    // ``` fenced code — scrolls inside its own box like the table below, so a
    // long line can never widen the page (the phone-overflow rule).
    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, "").trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push(
        <div key={key} style={{ ...card, padding: 0, margin: "10px 0", overflow: "hidden" }}>
          {lang && (
            <div style={{ fontFamily: FONT.mono, fontSize: size - 5.5, letterSpacing: ".08em", textTransform: "uppercase", color: C.dim, padding: "7px 12px", borderBottom: `1px solid ${C.line2}` }}>{lang}</div>
          )}
          <pre className="scrl" style={{ margin: 0, padding: "11px 12px", overflowX: "auto", fontFamily: FONT.mono, fontSize: size - 3, lineHeight: 1.55, color: C.text2 }}>
            <code>{buf.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }

    if (isTableRow(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        if (!isTableRule(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [head, ...rest] = rows;
      blocks.push(
        <div key={key} className="scrl" style={{ ...card, overflowX: "auto", margin: "8px 0" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: size - 2.5, fontFamily: FONT.sans }}>
            {head && (
              <thead>
                <tr>{head.map((c, ci) => <th key={ci} style={{ textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${C.line}`, color: C.text2, fontFamily: FONT.mono, fontSize: size - 5, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{c}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {rest.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => <td key={ci} style={{ padding: "7px 12px", borderBottom: ri < rest.length - 1 ? `1px solid ${C.line2}` : 0, color: C.text2, verticalAlign: "top" }}>{inline(c, `${key}-${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const items: { marker: string; text: string }[] = [];
      while (i < lines.length) {
        const b = lines[i].match(/^\s*[-•*]\s+(.*)$/);
        const o = lines[i].match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (b) items.push({ marker: "•", text: b[1] });
        else if (o) items.push({ marker: `${o[1]}.`, text: o[2] });
        else break;
        i++;
      }
      blocks.push(
        <div key={key} style={{ display: "grid", gap: 5, margin: "6px 0" }}>
          {items.map((it, ii) => (
            <div key={ii} style={{ display: "flex", gap: 9 }}>
              <span style={{ ...body, color: C.goldHi, flexShrink: 0, minWidth: 14, textAlign: "right" }}>{it.marker}</span>
              <span style={{ ...body, flex: 1, minWidth: 0, color: C.text2 }}>{inline(it.text, key + ii)}</span>
            </div>
          ))}
        </div>,
      );
      continue;
    }

    blocks.push(<div key={key} style={{ ...body, margin: "0 0 11px" }}>{inline(line, key)}</div>);
    i++;
  }

  return <div style={{ overflowWrap: "anywhere" }}>{blocks}</div>;
}
