"use client";
/*
 * AnswerMd — formats an Ask synthesis (markdown subset) as real content
 * instead of raw markup (RD 2026-07-05). Hand-rolled: no dependency, no
 * dangerouslySetInnerHTML — every node is built as React elements.
 *
 * Covers exactly what the synthesizer emits: #–#### headings, **bold**,
 * *italic*, "- " bullets, "1." ordered lists, | pipe | tables |, --- rules,
 * and [n] citations, which stay the tappable chips that scroll to the
 * matching source card (ids `src-<n>`, same contract as before).
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

/** Inline pass: **bold**, *italic*, [n] chips. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[(\d+)\]|\*[^*\n]+\*)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<b key={key} style={{ fontWeight: 700, color: C.text }}>{tok.slice(2, -2)}</b>);
    else if (m[2] != null) out.push(citeChip(m[2], key));
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
  const body: CSSProperties = { fontFamily: FONT.serif, fontSize: size, lineHeight: 1.62, color: C.text };

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

    if (/^-{3,}\s*$/.test(line)) {
      blocks.push(<div key={key} style={{ borderTop: `1px solid ${C.line2}`, margin: "12px 0" }} />);
      i++; continue;
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

    blocks.push(<div key={key} style={{ ...body, color: C.text2, margin: "6px 0" }}>{inline(line, key)}</div>);
    i++;
  }

  return <div style={{ overflowWrap: "anywhere" }}>{blocks}</div>;
}
