/*
 * wall.ts — getWall(): THE single provider for everything the Wall shows.
 *
 * Coherence by construction (rebuild invariant 9): every number, date, badge,
 * and label on the Mayor's default screen — needsYouNow, the cabinet cards,
 * the footer counts, the greeting date — derives from this ONE call over the
 * agents' latest runs. No widget computes its own count; the class of bugs
 * where a sidebar badge said 8 while the screen said 0 cannot recur.
 *
 * needsYouNow ranking: red first, then yellow, by recency; MAX 3; deduped by
 * threadId — a thread cited by two agents renders ONCE with merged agent
 * chips and the max urgency. Walled agents (harbor-wellness) NEVER enter
 * needsYouNow or the footer; their world is their own cabinet card.
 *
 * DEMO: assembles from fixture runs (lib/demo/data/domain-agents.ts) on the
 * demo's single clock (DEMO_NOW). Live: Phase 5 reads canonical.agent_runs.
 */
import { DOMAIN_AGENTS, domainAgentByKey, type Urgency } from "./domain-agents";
import { URGENCY_RANK, type AgentRun } from "./agent-run";
import { DEMO, DEMO_NOW, demoEvents, demoMessageMeta, type MessageMeta } from "./demo";
import { DEMO_AGENT_RUNS } from "./demo/data/domain-agents";

export type WallAction = "Approve" | "Review" | "Read";

export interface WallItem {
  id: string; // primary threadId (the dedup key)
  urgency: Urgency; // max across the merged agents
  line: string; // "Eleanor Meyer — Basement flooded AGAIN after Saturday's storm"
  agentKeys: string[]; // merged chips, cabinet order
  action: WallAction; // ONE verb on the right
  target: { kind: "queue" | "digest"; agentKey: string };
  messageId: string; // primary message (drill-in)
  date: string; // newest cited message date (recency rank)
}

export interface CabinetCard {
  agentKey: string;
  name: string;
  icon: string;
  color: string; // identity hue — recognition channel (urgency stays the action channel)
  statusDot: Urgency;
  walled: boolean;
  headline: string;
  counts: { newItems: number; needsYou: number };
  lastRunLabel: string; // "updated 25m ago"
}

export interface WallCitation {
  messageId: string;
  label: string;
}
export interface WallDigestPoint {
  point: string;
  sources: WallCitation[];
}
export interface WallActItem {
  threadId: string;
  subject: string;
  body: string;
  rationale: string;
  citations: WallCitation[];
}
/** One agent's full latest run, enriched for the digest sheet — carried in the
 *  same payload so the sheet can never disagree with the card that opened it. */
export interface WallRun {
  agentKey: string;
  ranAt: string;
  urgency: Urgency;
  headline: string;
  digest: WallDigestPoint[];
  actItems: WallActItem[];
}

/** The Schedule card's calendar face — the "Coming up" idiom: today (even if
 *  clear) plus the next few days that HAVE events. A visual cue, NOT a
 *  calendar replacement — deep links go to the real calendars. */
export interface ScheduleDayEvent {
  title: string;
  time: string | null;
  source: "gov" | "gmail";
}
export interface ScheduleDay {
  date: string; // ISO day
  dayNum: number;
  month: string; // "Jul"
  weekday: string; // "Thu"
  isToday: boolean;
  events: ScheduleDayEvent[];
}
export interface WallSchedule {
  days: ScheduleDay[];
  links: { label: string; href: string }[]; // out to Outlook / Google Calendar
}

export interface WallPayload {
  greeting: string; // one sober, time-coherent line
  dateLabel: string; // derives from the SAME clock as the content
  needsYouNow: WallItem[];
  cabinet: CabinetCard[];
  schedule: WallSchedule;
  footer: { handled: number; waiting: number; etaMinutes: number };
  runs: Record<string, WallRun>;
  generatedAt: string;
}

export interface WallOpts {
  hour?: number; // the Mayor's local hour — greeting time-of-day only
  mayorName?: string;
}

export function getWall(opts: WallOpts = {}): WallPayload {
  if (!DEMO) {
    // Phase 5: read each agent's latest row from canonical.agent_runs.
    throw new Error("Live Wall reads canonical.agent_runs — lands in Phase 5 (/api/cron/agent-runs).");
  }
  const active = new Set(DOMAIN_AGENTS.filter((a) => a.active).map((a) => a.key));
  return assembleWall(DEMO_AGENT_RUNS.filter((r) => active.has(r.agentKey)), DEMO_NOW, opts);
}

/** Pure assembly over a set of latest runs — exported so the eval harness can
 *  prove the ranking/dedup/walled rules on fabricated runs too. */
export function assembleWall(runs: AgentRun[], now: string, opts: WallOpts = {}): WallPayload {
  // one metadata pass over every cited message
  const allIds = new Set<string>();
  for (const r of runs) {
    r.output.digest.forEach((d) => d.sourceMessageIds.forEach((id) => allIds.add(id)));
    r.output.actItems.forEach((a) => a.citations.forEach((id) => allIds.add(id)));
  }
  const meta = demoMessageMeta([...allIds]);
  const threadOf = (id: string) => meta.get(id)?.threadId ?? id;

  // ── candidates → merge by thread overlap → rank ────────────────────────────
  interface Cand {
    agentKey: string;
    urgency: Urgency;
    hasAct: boolean;
    autonomy: string;
    threads: Set<string>;
    ids: string[];
  }
  const cands: Cand[] = [];
  for (const r of runs) {
    const agent = domainAgentByKey(r.agentKey);
    if (!agent || agent.walled) continue; // walled items never leave their card
    if (r.output.urgency === "clear") continue; // calm agents push nothing — no FYI filler
    for (const d of r.output.digest) {
      cands.push({
        agentKey: agent.key, urgency: r.output.urgency, hasAct: false, autonomy: agent.autonomy,
        threads: new Set(d.sourceMessageIds.map(threadOf)), ids: d.sourceMessageIds,
      });
    }
    for (const a of r.output.actItems) {
      cands.push({
        agentKey: agent.key, urgency: r.output.urgency, hasAct: true, autonomy: agent.autonomy,
        threads: new Set([a.threadId, ...a.citations.map(threadOf)]), ids: a.citations,
      });
    }
  }

  // transitive merge: groups whose thread sets intersect collapse to one item
  const groups: Cand[][] = [];
  for (const c of cands) {
    const hits = groups.filter((g) => g.some((x) => [...c.threads].some((t) => x.threads.has(t))));
    if (hits.length === 0) groups.push([c]);
    else {
      const [first, ...rest] = hits;
      first.push(c);
      for (const g of rest) {
        first.push(...g);
        groups.splice(groups.indexOf(g), 1);
      }
    }
  }

  const order = new Map(DOMAIN_AGENTS.map((a, i) => [a.key, i]));
  const items: WallItem[] = groups.map((g) => {
    const urgency = g.reduce<Urgency>((u, c) => (URGENCY_RANK[c.urgency] < URGENCY_RANK[u] ? c.urgency : u), "clear");
    const agentKeys = [...new Set(g.map((c) => c.agentKey))].sort(
      (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99),
    );
    // primary message = the newest INBOUND cited message (the constituent's ask
    // is the story, not the department's reply); fall back to newest overall
    const metas = g.flatMap((c) => c.ids).map((id) => meta.get(id)).filter((m): m is MessageMeta => !!m);
    metas.sort((a, b) => b.date.localeCompare(a.date));
    const newest = metas.find((m) => m.direction === "inbound") ?? metas[0];
    const lead = g.find((c) => URGENCY_RANK[c.urgency] === URGENCY_RANK[urgency])!;
    const act = g.find((c) => c.hasAct);
    const line = newest
      ? `${newest.fromName ?? "—"} — ${(newest.subject ?? "").replace(/^re:\s*/i, "")}`
      : agentKeys.join(" · ");
    return {
      id: newest?.threadId ?? [...g[0].threads][0],
      urgency,
      line,
      agentKeys,
      action: act ? "Approve" : lead.autonomy === "observe" ? "Read" : "Review",
      target: act ? { kind: "queue" as const, agentKey: act.agentKey } : { kind: "digest" as const, agentKey: lead.agentKey },
      messageId: newest?.messageId ?? g[0].ids[0],
      date: newest?.date ?? now,
    };
  });
  const needsYouNow = items
    .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.date.localeCompare(a.date))
    .slice(0, 3);

  // ── cabinet cards + enriched runs, in registry order ──────────────────────
  const chipLabel = (id: string): string => {
    const m = meta.get(id);
    if (m) return m.fromName ?? m.subject ?? id.slice(0, 12);
    return id.startsWith("doc-") ? "Document" : id.slice(0, 12);
  };
  const cabinet: CabinetCard[] = [];
  const runsOut: Record<string, WallRun> = {};
  for (const agent of DOMAIN_AGENTS) {
    const run = runs.find((r) => r.agentKey === agent.key);
    if (!run) continue;
    cabinet.push({
      agentKey: agent.key,
      name: agent.name,
      icon: agent.icon,
      color: agent.color,
      statusDot: run.output.urgency,
      walled: !!agent.walled,
      headline: run.output.headline,
      counts: { newItems: run.output.digest.length, needsYou: run.output.actItems.length },
      lastRunLabel: relLabel(run.ranAt, now),
    });
    runsOut[agent.key] = {
      agentKey: agent.key,
      ranAt: run.ranAt,
      urgency: run.output.urgency,
      headline: run.output.headline,
      digest: run.output.digest.map((d) => ({
        point: d.point,
        sources: d.sourceMessageIds.map((id) => ({ messageId: id, label: chipLabel(id) })),
      })),
      actItems: run.output.actItems.map((a) => ({
        threadId: a.threadId,
        subject: a.draftSubject,
        body: a.draftBody,
        rationale: a.rationale,
        citations: a.citations.map((id) => ({ messageId: id, label: chipLabel(id) })),
      })),
    };
  }

  // footer counts are government-surface numbers: walled agents excluded
  const govRuns = runs.filter((r) => !domainAgentByKey(r.agentKey)?.walled);
  const handled = govRuns.reduce((n, r) => n + r.output.digest.length, 0);
  const waiting = govRuns.reduce((n, r) => n + r.output.actItems.length, 0);
  const etaMinutes = waiting ? Math.max(1, Math.ceil(waiting * 1.5)) : 0;

  // One sober, time-coherent line — same form whether the day is calm or on
  // fire (invariant: never playful when red exists; no weather, no coffee).
  const hour = opts.hour ?? 8;
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const greeting = `Good ${part}, ${(opts.mayorName || "Mayor Harvey").trim()}.`;

  return {
    greeting,
    dateLabel: new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    needsYouNow,
    cabinet,
    schedule: buildSchedule(now),
    footer: { handled, waiting, etaMinutes },
    runs: runsOut,
    generatedAt: now,
  };
}

/** "Coming up" on ONE clock (the demo's): today first — "No events today" is
 *  said, not hidden — then the next 3 days that HAVE events. The wall applies:
 *  business-operational gmail items never surface on this government card;
 *  personal/community holds do. */
function buildSchedule(now: string): WallSchedule {
  const today = now.slice(0, 10);
  const upcoming = demoEvents()
    .events.filter((e) => !(e.source === "gmail" && e.topic === "business"))
    .filter((e) => e.status !== "done" && e.date.slice(0, 10) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const byDay = new Map<string, ScheduleDayEvent[]>();
  for (const e of upcoming) {
    const iso = e.date.slice(0, 10);
    const list = byDay.get(iso) ?? [];
    if (list.length < 3)
      list.push({
        title: e.title,
        time: new Date(e.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }),
        source: (e.source === "gmail" ? "gmail" : "gov") as "gov" | "gmail",
      });
    byDay.set(iso, list);
  }

  const mkDay = (iso: string): ScheduleDay => {
    const d = new Date(`${iso}T00:00:00Z`);
    return {
      date: iso,
      dayNum: d.getUTCDate(),
      month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      isToday: iso === today,
      events: byDay.get(iso) ?? [],
    };
  };
  const days = [mkDay(today), ...[...byDay.keys()].filter((d) => d > today).sort().slice(0, 3).map(mkDay)];

  // Calendar WORK stays out of the app — these deep-link to the real calendars.
  const links = [
    { label: "Outlook Calendar", href: "https://outlook.office.com/calendar/" },
    { label: "Google Calendar", href: "https://calendar.google.com/" },
  ];
  return { days, links };
}

/** The push-notification one-liner (cron → phone): reads like
 *  "1 urgent: Eleanor Meyer — Basement flooded AGAIN… · 3 drafts ready · ≈5 min". */
export function wallPushLine(w: WallPayload): string {
  const urgent = w.needsYouNow.filter((i) => i.urgency === "red");
  const head = urgent.length ? `${urgent.length} urgent: ${urgent[0].line}` : "Nothing urgent";
  if (!w.footer.waiting) return `${head}.`;
  return `${head} · ${w.footer.waiting} draft${w.footer.waiting === 1 ? "" : "s"} ready · ≈${w.footer.etaMinutes} min`;
}

function relLabel(ranAt: string, now: string): string {
  const mins = Math.max(0, Math.round((new Date(now).getTime() - new Date(ranAt).getTime()) / 60000));
  if (mins < 60) return `updated ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `updated ${hours}h ago`;
  return `updated ${Math.round(hours / 24)}d ago`;
}
