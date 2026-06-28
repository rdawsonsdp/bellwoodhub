/*
 * routines.ts — scheduled agent runs (demo registry).
 *
 * A Routine binds an AGENT (its scope + task) to a SCHEDULE + parameters. The two
 * are decoupled: the agent defines *what* it does; the routine defines *when* and
 * *where*. One agent can run many routines (e.g. the Ingestion agent fetches
 * council minutes biweekly AND permit files monthly — different cron + scope).
 *
 * Demo: read-only display of the architecture. No scheduler fires these yet —
 * production wiring (Vercel Cron / Supabase pg_cron → /api/cron/tick → run agent →
 * log to Agent Activity) is a tracked feature. Toggles persist to localStorage.
 */
import type { Autonomy } from "./cos-agents";

export interface Routine {
  id: string;
  agentKey: string;   // cos-agents key
  agent: string;      // display name
  name: string;       // what this routine does
  schedule: string;   // human cadence
  cron: string;       // cron expression (display)
  scope: string;      // where it works — directory / server / feed
  autonomy: Autonomy;
  lastRun: string;
  nextRun: string;
  status: "healthy" | "scheduled" | "paused" | "planned";
}

export const ROUTINES: Routine[] = [
  { id: "rt-council", agentKey: "resolver", agent: "Resolver & Ingestion Agent", name: "Fetch city council minutes", schedule: "Every 2 weeks · 1st & 3rd Mon, 6:00 AM", cron: "0 6 1-7,15-21 * 1", scope: "SFTP · /records/council/minutes/*.pdf", autonomy: "R1", lastRun: "Jun 16 · 14 documents", nextRun: "Jun 30 · in 2 days", status: "scheduled" },
  { id: "rt-permits", agentKey: "resolver", agent: "Resolver & Ingestion Agent", name: "Download monthly permit files", schedule: "Monthly · 1st, 2:00 AM", cron: "0 2 1 * *", scope: "https://permits.villageofbellwood.gov/exports", autonomy: "R1", lastRun: "Jun 1 · 312 files", nextRun: "Jul 1 · in 3 days", status: "scheduled" },
  { id: "rt-police", agentKey: "resolver", agent: "Resolver & Ingestion Agent", name: "Police RMS nightly batch", schedule: "Daily · 2:00 AM", cron: "0 2 * * *", scope: "Police RMS · nightly CSV (restricted)", autonomy: "R2", lastRun: "Today · 12 reports", nextRun: "Tomorrow · 2:00 AM", status: "healthy" },
  { id: "rt-fire", agentKey: "resolver", agent: "Resolver & Ingestion Agent", name: "Fire / EMS NFIRS sync", schedule: "Daily · 2:00 AM", cron: "0 2 * * *", scope: "NFIRS feed · API", autonomy: "R1", lastRun: "Today · 7 incidents", nextRun: "Tomorrow · 2:00 AM", status: "healthy" },
  { id: "rt-foia", agentKey: "compliance", agent: "Compliance Watchtower", name: "FOIA portal scan", schedule: "Hourly", cron: "0 * * * *", scope: "FOIA / records portal · scrape", autonomy: "R2", lastRun: "32 min ago", nextRun: "in 28 min", status: "healthy" },
  { id: "rt-brief", agentKey: "brief", agent: "Morning Brief Agent", name: "Assemble the morning brief", schedule: "Weekdays · 6:00 AM", cron: "0 6 * * 1-5", scope: "Overnight correspondence + open issues", autonomy: "R4", lastRun: "Today · 6:11 AM", nextRun: "Tomorrow · 6:00 AM", status: "healthy" },
  { id: "rt-grant", agentKey: "grant", agent: "Grant Radar", name: "Scan grant deadlines", schedule: "Weekly · Mon, 7:00 AM", cron: "0 7 * * 1", scope: "Grants.gov + IEPA + state portals", autonomy: "R3", lastRun: "—", nextRun: "paused", status: "planned" },
];

/** Agents that run ON DEMAND (no schedule) — the contrast to scheduled routines. */
export const ON_DEMAND_AGENTS: { agent: string; note: string }[] = [
  { agent: "Drafting Agent", note: "drafts a reply when an email needs one" },
  { agent: "AI Search Agent", note: "answers a question over the record when you ask" },
  { agent: "History Agent", note: "builds a person/property timeline when you open one" },
  { agent: "Chief of Staff", note: "briefs you when you open the Today screen" },
];
