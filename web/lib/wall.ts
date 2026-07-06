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
 * demo's single clock (DEMO_NOW). Live: each agent's latest canonical.agent_runs
 * row + canonical.messages metadata (lib/live-inbox), on the real clock. Zero
 * runs → a calm, honestly empty Wall — never fixtures.
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
  origin?: "default" | "custom"; // Default = code-defined roster; Custom = Agent-Factory-created (RD 2026-07-03)
  headline: string;
  counts: { newItems: number; needsYou: number };
  lastRunLabel: string; // "updated 25m ago"
  freshAt: string; // the run this card currently shows — the client compares
  //               against its per-agent "last seen" to light the new-badge
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
/** An email the system actually transmitted (app.drafts.sent_at) — the
 *  agent's outbound record, shown on its digest sheet grouped by day. */
export interface SentEmail {
  timeLabel: string; // "3:51 PM" (Mayor-local)
  to: string;
  subject: string;
}
export interface SentDay {
  date: string; // ISO day, Mayor-local
  label: string; // "Today" / "Yesterday" / "Friday, Jul 3"
  items: SentEmail[];
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
  /** Present on agents that can transmit (the Gmail seat): what actually went
   *  out in the past 3 days. Empty array = honest "nothing sent". */
  sent?: SentDay[];
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
  /** The send cage is armed (SEND_ENABLED=1): Approve really transmits.
   *  Drives the pulsing "Live send on" pill. Always false in DEMO. */
  sendLive: boolean;
}

export interface WallOpts {
  hour?: number; // the Mayor's local hour — greeting time-of-day only
  mayorName?: string;
}

/** Active agents for the SERVER providers (wall + queue, both branches).
 *  ACTIVE_AGENTS (comma-separated registry keys) overrides the registry flags —
 *  the pilot runs a narrowed cabinet without touching the demo registry.
 *  Unset → the flags rule. Never read process.env in client components. */
export function activeAgentKeys(): Set<string> {
  const env = (process.env.ACTIVE_AGENTS ?? "").trim();
  if (!env) return new Set(DOMAIN_AGENTS.filter((a) => a.active).map((a) => a.key));
  const wanted = new Set(env.split(",").map((k) => k.trim()).filter(Boolean));
  return new Set(DOMAIN_AGENTS.filter((a) => wanted.has(a.key)).map((a) => a.key));
}

export async function getWall(opts: WallOpts = {}): Promise<WallPayload> {
  const active = activeAgentKeys();
  if (!DEMO) {
    // Live: latest run per active agent; cited source_refs resolve against
    // canonical.messages (missing ids fall back to id-as-label in assembly).
    // Dynamic import keeps lib/db out of the demo module graph.
    const { liveLatestRuns, liveMessageMeta } = await import("./live-inbox");
    const runs = (await liveLatestRuns()).filter((r) => active.has(r.agentKey));
    const ids = new Set<string>();
    for (const r of runs) {
      r.output.digest.forEach((d) => d.sourceMessageIds.forEach((id) => ids.add(id)));
      r.output.actItems.forEach((a) => a.citations.forEach((id) => ids.add(id)));
    }
    const wall = assembleWall(runs, new Date().toISOString(), opts, await liveMessageMeta([...ids]));
    // the cage state rides the same payload as everything else (invariant 9)
    wall.sendLive = process.env.SEND_ENABLED === "1";
    // "Coming up" reads the live calendar mirror — fixture events never leak here
    wall.schedule = await buildLiveSchedule(wall.generatedAt);
    // The email agents hold cabinet seats from connector STATUS alone (RD
    // 2026-07-03: "the Wall should have the current email agent") — the sync
    // layer is visible before the intelligence layer produces its first run.
    await addConnectorCards(wall);
    return wall;
  }
  return assembleWall(DEMO_AGENT_RUNS.filter((r) => active.has(r.agentKey)), DEMO_NOW, opts);
}

/** Synthesize a Default cabinet card + status digest per connected mailbox
 *  from pipeline.connector_accounts — no agent_runs required. The digest
 *  points are source-less by design: they are connector telemetry, not
 *  claims about mail content. */
async function addConnectorCards(wall: WallPayload): Promise<void> {
  const { query } = await import("./db");
  const accounts = await query<{
    provider: "outlook" | "gmail"; address: string; mailbox_id: string;
    status: string; cursor: string | null; last_synced_at: string | null;
  }>(
    `SELECT provider, address, mailbox_id, status, cursor, last_synced_at::text
       FROM pipeline.connector_accounts ORDER BY created_at`,
  );
  if (!accounts.length) return;
  // the in-app enable switch (app.agent_configs, FEAT-19): a disabled email
  // agent gives up its cabinet seat until re-enabled
  const off = new Set(
    (await query<{ agent_key: string }>(
      `SELECT agent_key FROM app.agent_configs WHERE NOT enabled`,
    ).catch(() => [] as { agent_key: string }[])).map((r) => r.agent_key),
  );
  const totals = await query<{ messages: string; today: string; calendar: string }>(
    `SELECT (SELECT count(*) FROM canonical.messages) AS messages,
            (SELECT count(*) FROM canonical.messages WHERE sent_at::date = now()::date) AS today,
            (SELECT count(*) FROM app.calendar_events) AS calendar`,
  );
  const t = totals[0];
  const sentDays = await recentSentDays();
  const seats: CabinetCard[] = [];
  for (const a of accounts) {
    const agentKey = a.provider === "gmail" ? "email-gmail" : "email-outlook";
    if (off.has(agentKey)) continue;
    const name = a.provider === "gmail" ? "Gmail Email Agent" : "Outlook Email Agent";
    const midWalk = !!a.cursor?.startsWith("bf:");
    const statusDot: Urgency = a.status === "error" ? "red" : a.status === "active" ? "clear" : "yellow";
    const headline =
      a.status === "error" ? "Sync error — see Sources for details."
      : a.status !== "active" ? "Connected, awaiting activation."
      : midWalk ? `Mirroring the mailbox — ${Number(t.messages).toLocaleString()} messages so far.`
      : `${Number(t.messages).toLocaleString()} messages mirrored · watching for new mail.`;
    const freshAt = a.last_synced_at ?? wall.generatedAt;
    seats.push({
      agentKey, name, icon: "mail", color: a.provider === "gmail" ? "#5b8def" : "#67adff",
      statusDot, walled: a.mailbox_id === "biz", origin: "default",
      headline, counts: { newItems: Number(t.today), needsYou: 0 },
      lastRunLabel: a.last_synced_at ? relLabel(a.last_synced_at, wall.generatedAt) : "never synced",
      freshAt,
    });
    wall.runs[agentKey] = {
      agentKey, ranAt: freshAt, urgency: statusDot === "red" ? "yellow" : "clear",
      headline,
      digest: [
        { point: `Account: ${a.address} (${a.mailbox_id === "biz" ? "private" : "public record"} mailbox).`, sources: [] },
        { point: `${Number(t.messages).toLocaleString()} messages mirrored into the record; ${Number(t.today).toLocaleString()} dated today.`, sources: [] },
        { point: midWalk ? "Initial mailbox walk in progress — press Sync to continue pulling history." : "Initial mirror complete; incremental sync picks up new mail.", sources: [] },
        ...(a.provider === "gmail" ? [{ point: `${Number(t.calendar).toLocaleString()} calendar events mirrored (rolling 60-day window).`, sources: [] }] : []),
        ...(a.status === "error" ? [{ point: "Connector is in an error state — the Sources screen has the message; a fresh sign-in usually clears it.", sources: [] }] : []),
      ],
      actItems: [],
      // sends are wired for Gmail only (approvals route) — the outbound
      // record belongs to the seat that can transmit
      ...(a.provider === "gmail" ? { sent: sentDays } : {}),
    };
  }
  // the mail desks lead the cabinet, Gmail in the upper-left seat
  // (RD 2026-07-05) — on the pilot the mailbox IS the working surface
  seats.sort((a, b) => Number(b.agentKey === "email-gmail") - Number(a.agentKey === "email-gmail"));
  wall.cabinet.unshift(...seats);
  // registry cards are code-defined too — mark them Default so the
  // Default-vs-Custom vocabulary is ready for the Agent Factory
  for (const c of wall.cabinet) if (!c.origin) c.origin = "default";

  // RD 2026-07-05: on live, the cabinet light is the LIVENESS channel —
  // green = this desk's engine reported in recently, red = it is not
  // running. (Urgency keeps its channels: needsYouNow rows + digest sheets.)
  // Email seats: connector active + synced inside 2h. Schedule: the calendar
  // mirror rides the Google account's token, so it is live while that
  // connector is. Everyone else: a run inside 25h (hourly/daily cadence).
  const googleLive = accounts.some((a) => a.provider === "gmail" && a.status === "active");
  const fresh = (iso: string | null | undefined, hours: number) =>
    !!iso && Date.now() - new Date(iso).getTime() < hours * 3_600_000;
  for (const c of wall.cabinet) {
    if (c.agentKey === "email-gmail" || c.agentKey === "email-outlook") {
      const acct = accounts.find((x) => (x.provider === "gmail" ? "email-gmail" : "email-outlook") === c.agentKey);
      c.statusDot = acct?.status === "active" && fresh(acct.last_synced_at, 2) ? "clear" : "red";
    } else if (c.agentKey === "schedule") {
      c.statusDot = googleLive ? "clear" : "red";
    } else {
      c.statusDot = fresh(wall.runs[c.agentKey]?.ranAt, 25) ? "clear" : "red";
    }
  }
}

/** What actually went out (app.drafts.sent_at) in the past 3 days, grouped by
 *  Mayor-local day, newest first. A failed lookup yields [] — the sheet then
 *  states "nothing sent" rather than the Wall failing. */
const MAYOR_TZ = "America/Chicago";
async function recentSentDays(): Promise<SentDay[]> {
  const { query } = await import("./db");
  type Row = { recipients: string | null; subject: string | null; sent_at: string };
  const rows = await query<Row>(
    `SELECT recipients, subject, sent_at::text AS sent_at
       FROM app.drafts
      WHERE sent_at IS NOT NULL AND sent_at > now() - interval '3 days'
      ORDER BY sent_at DESC LIMIT 100`,
  ).catch(() => [] as Row[]);
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: MAYOR_TZ });
  const now = new Date();
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getTime() - 86_400_000));
  const days: SentDay[] = [];
  for (const r of rows) {
    const at = new Date(r.sent_at);
    const key = dayKey(at);
    let day = days.find((d) => d.date === key);
    if (!day) {
      const label =
        key === todayKey ? "Today"
        : key === yesterdayKey ? "Yesterday"
        : at.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: MAYOR_TZ });
      day = { date: key, label, items: [] };
      days.push(day);
    }
    day.items.push({
      timeLabel: at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: MAYOR_TZ }),
      to: r.recipients ?? "—",
      subject: r.subject ?? "(no subject)",
    });
  }
  return days;
}

/** Pure assembly over a set of latest runs — exported so the eval harness can
 *  prove the ranking/dedup/walled rules on fabricated runs too. `metaIn` is the
 *  live path's canonical metadata; absent → the demo fixtures resolve. */
export function assembleWall(runs: AgentRun[], now: string, opts: WallOpts = {}, metaIn?: Map<string, MessageMeta>): WallPayload {
  // one metadata pass over every cited message
  const allIds = new Set<string>();
  for (const r of runs) {
    r.output.digest.forEach((d) => d.sourceMessageIds.forEach((id) => allIds.add(id)));
    r.output.actItems.forEach((a) => a.citations.forEach((id) => allIds.add(id)));
  }
  const meta = metaIn ?? demoMessageMeta([...allIds]);
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
      freshAt: run.ranAt,
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

  // The anticipation loop (RD 2026-07-02): in DEMO one government desk "reports
  // in" each hour so the cabinet varies visit to visit — deterministic in
  // `hour`, so evals hold and the demo stays coherent. Live cards keep their
  // REAL ran_at freshness (the cron staggers actual runs); no fake "just now".
  const rotHour = opts.hour ?? 8;
  const govCards = cabinet.filter((c) => !c.walled);
  if (DEMO && govCards.length) {
    const fresh = govCards[((rotHour % govCards.length) + govCards.length) % govCards.length];
    fresh.freshAt = `${now.slice(0, 11)}${String(((rotHour % 24) + 24) % 24).padStart(2, "0")}:00:00.000Z`;
    fresh.lastRunLabel = "updated just now";
  }

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
    sendLive: false, // the live branch of getWall() arms this from the env
  };
}

/** "Coming up" on ONE clock (the demo's): today first — "No events today" is
 *  said, not hidden — then the next 3 days that HAVE events. The wall applies:
 *  business-operational gmail items never surface on this government card;
 *  personal/community holds do. */
function buildSchedule(now: string): WallSchedule {
  const today = now.slice(0, 10);
  // Live is buildLiveSchedule (getWall overrides the schedule after assembly —
  // this fixture path stays sync for the eval harness); here live yields [].
  const upcoming = (DEMO ? demoEvents().events : [])
    .filter((e) => !(e.source === "gmail" && e.topic === "business"))
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

/** LIVE "Coming up": the app.calendar_events mirror (cron/ingest-calendar),
 *  same card shape as buildSchedule but on the Mayor's real clock and
 *  timezone — today (even if clear) plus the next 3 days that HAVE events.
 *  gcal rows ride the Gmail grant, so they render in the 'gmail' lane.
 *  Empty mirror → "No events today", honestly — never fixtures. Dynamic
 *  import keeps lib/db out of the demo module graph (same as getWall). */
async function buildLiveSchedule(now: string): Promise<WallSchedule> {
  const TZ = "America/Chicago"; // Bellwood's clock, not the server's
  const { query } = await import("./db");
  const rows = await query<{ title: string | null; starts_at: Date; all_day: boolean }>(
    `SELECT title, starts_at, all_day FROM app.calendar_events
      WHERE status <> 'cancelled' AND starts_at >= now() - interval '1 day'
      ORDER BY starts_at`,
  );
  const localDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // ISO day in TZ
  const today = localDay(new Date(now));

  const byDay = new Map<string, ScheduleDayEvent[]>();
  for (const r of rows) {
    const d = new Date(r.starts_at);
    const iso = localDay(d);
    if (iso < today) continue; // the −1d fetch pad covers the UTC/local seam
    const list = byDay.get(iso) ?? [];
    if (list.length < 3)
      list.push({
        title: r.title ?? "(untitled)",
        time: r.all_day ? null : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }),
        source: "gmail",
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
  return {
    days,
    links: [
      { label: "Outlook Calendar", href: "https://outlook.office.com/calendar/" },
      { label: "Google Calendar", href: "https://calendar.google.com/" },
    ],
  };
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
