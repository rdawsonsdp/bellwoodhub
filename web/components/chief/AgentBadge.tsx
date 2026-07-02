"use client";
/*
 * AgentBadge — the domain agents' visual identity, used identically on every
 * surface (cabinet cards, needs-you chips, digest sheet, queue provenance) so
 * the Mayor learns each agent's mark once.
 *
 * Two color channels, deliberately separate:
 *   identity (this file) — WHO is speaking: each agent's hue + emblem.
 *   urgency (red/yellow/green bars & dots) — WHAT to do: directs action.
 * Identity hues avoid the pure urgency reds/ambers so the channels never fight.
 */
import type { CSSProperties } from "react";
import { FONT } from "@/lib/cos-design";
import { domainAgentByKey } from "@/lib/domain-agents";

/** Stroke emblems per cabinet seat (house SVG idiom; the registry's Material
 *  Symbols names remain the spec — these are their local renderings). */
export const AGENT_ICON: Record<string, string[]> = {
  police: ["M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"],
  fire: ["M12 2c1 4-3 5.5-3 9.5a3 3 0 0 0 6 0c0-1.6-.8-2.8-.8-2.8s3.8 1.8 3.8 5.8a6 6 0 0 1-12 0c0-6 5-8 6-12.5z"],
  council: ["M3 21h18", "M5 21V10M9 21V10M15 21V10M19 21V10", "M3 10l9-7 9 7"],
  constituent: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  schedule: ["M7 3v3M17 3v3M4 9h16", "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"],
  hr: ["M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0", "M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"],
  "harbor-wellness": ["M4 9h16v11H4z", "M3 9l2-5h14l2 5", "M9 20v-6h6v6"],
};
const FALLBACK_ICON = ["M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z"];
const FALLBACK_COLOR = "#93a4bd";

export const agentColor = (agentKey: string): string =>
  domainAgentByKey(agentKey)?.color ?? FALLBACK_COLOR;

export function AgentIco({ agentKey, w = 16, color }: { agentKey: string; w?: number; color?: string }) {
  const d = AGENT_ICON[agentKey] ?? FALLBACK_ICON;
  return (
    <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color ?? agentColor(agentKey)} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

/** Dark glyph on the solid fill — same ink on every avatar so the hue alone
 *  carries identity (the Granola/Notion avatar treatment). */
const GLYPH_INK = "#182126";

/** The agent's "logo": a SOLID saturated circle with a dark emblem — the
 *  learnable mark. Color lives here; surrounding text stays neutral. */
export function AgentAvatar({ agentKey, size = 30 }: { agentKey: string; size?: number }) {
  const color = agentColor(agentKey);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 99, background: color, boxShadow: "inset 0 -2px 4px rgba(0,0,0,.14)", flexShrink: 0 }}>
      <AgentIco agentKey={agentKey} w={Math.round(size * 0.56)} color={GLYPH_INK} />
    </span>
  );
}

/** Compact identity chip (needs-you rows, provenance lines): mini solid
 *  avatar + a plain neutral label — color only in the dot. */
export function AgentChip({ agentKey, label }: { agentKey: string; label: string }) {
  return (
    <span style={chipBase}>
      <AgentAvatar agentKey={agentKey} size={15} /> {label}
    </span>
  );
}

const chipBase: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 4px", borderRadius: 99,
  fontSize: 11, fontWeight: 650, fontFamily: FONT.sans, whiteSpace: "nowrap", color: "var(--c-text2)",
};
