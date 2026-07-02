"use client";
/*
 * ComingUp — the Schedule agent's calendar face (today marked, then the next
 * event days; gold ticks = government, violet = personal gmail), plus the
 * deep links OUT to the real calendars. One component so the cabinet card and
 * the agent's detail sheet can never drift apart. Data comes with the wall
 * payload — walled business items are already excluded by the provider.
 */
import { C, FONT } from "@/lib/cos-design";
import type { WallSchedule } from "@/lib/wall";

const SRC: Record<string, string> = { gov: C.gold, gmail: C.purpleText };

export default function ComingUp({ schedule }: { schedule: WallSchedule }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gap: 10 }}>
        {schedule.days.map((d) => (
          <div key={d.date} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ display: "flex", gap: 5, alignItems: "flex-start", width: 52, flexShrink: 0 }}>
              <span style={{ fontFamily: FONT.serif, fontSize: 23, fontWeight: 600, lineHeight: 1, color: C.text }}>{d.dayNum}</span>
              <span style={{ paddingTop: 1 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: C.muted, lineHeight: 1.2 }}>{d.month}</span>
                  {d.isToday && <span style={{ width: 4, height: 4, borderRadius: 99, background: C.red }} />}
                </span>
                <span style={{ display: "block", fontSize: 8.5, color: C.dim, lineHeight: 1.2 }}>{d.weekday}</span>
              </span>
            </span>
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6, paddingTop: 2 }}>
              {d.events.length === 0 && (
                <span style={{ fontSize: 12, color: C.dim, borderLeft: `2.5px solid ${C.line}`, paddingLeft: 8, lineHeight: 1.4 }}>No events today</span>
              )}
              {d.events.map((e, i) => (
                <span key={i} style={{ display: "block", borderLeft: `2.5px solid ${SRC[e.source]}`, paddingLeft: 8, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 650, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: C.text }}>{e.title}</span>
                  {e.time && <span style={{ display: "block", fontFamily: FONT.mono, fontSize: 9.5, color: C.muted, marginTop: 1 }}>{e.time}</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {schedule.links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 700, color: C.blue, textDecoration: "none", fontFamily: FONT.sans }}>
            {l.label} ↗
          </a>
        ))}
      </div>
    </div>
  );
}
