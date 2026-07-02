/*
 * agent-memory.ts — DEMO fixtures for each domain agent's memory namespace.
 * Hand-authored from the seed corpus so digests can say "3rd complaint at this
 * address this quarter" with the prior sourceMessageIds cited. Live mode
 * replaces this with canonical.agent_memory (migrations/002_domain_agents.sql).
 *
 * Upsert identity is (agentKey, kind, title) — see lib/agent-run.ts.
 */
import type { AgentMemoryItem } from "../../agent-run";

export const DEMO_AGENT_MEMORY: Record<string, AgentMemoryItem[]> = {
  constituent: [
    {
      agentKey: "constituent",
      kind: "commitment",
      entityId: "demo-ent-2", // Eleanor Meyer
      title: "Frederick Ave regrade — 1733 Frederick Ave (Eleanor Meyer)",
      body:
        "Rear-yard regrade + French drain estimated 2026-04-27 after the March sump-pump flood. Promised, unscheduled. Third basement flood reported 2026-06-26 — the commitment is now the complaint.",
      status: "open",
      occurrenceCount: 3,
      sourceMessageIds: [
        "<a2-422729edc2041d99@mail.bellwood-demo.gov>",
        "<a2-c40b404847838f18@mail.bellwood-demo.gov>",
        "<a2-4a79f4293d46a2ad@mail.bellwood-demo.gov>",
        "<now-4719fd94f5ae0394@mail.bellwood-demo.gov>",
      ],
      firstSeen: "2026-03-03T00:50:00.877Z",
      lastSeen: "2026-06-28T06:40:00.000Z",
    },
    {
      agentKey: "constituent",
      kind: "pattern",
      entityId: "demo-ent-1", // Gloria Bennett
      title: "Gloria Bennett — seven contacts, always civil, follow through fast",
      body:
        "Repeat correspondent since the water-bill mixup; thanked the office once. Goodwill is high and worth keeping — her reports are accurate.",
      status: "open",
      occurrenceCount: 7,
      sourceMessageIds: [
        "<579c65cd1896cfc4@mail.bellwood-demo.gov>",
        "<6d9c0a9202f9e36b@mail.bellwood-demo.gov>",
        "<3f209918174003cb@mail.bellwood-demo.gov>",
      ],
      firstSeen: "2024-05-14T00:00:00.000Z",
      lastSeen: "2026-06-24T19:59:00.877Z",
    },
    {
      agentKey: "constituent",
      kind: "pattern",
      title: "St. Charles corridor late-night noise — remedy: operating-hours review",
      body:
        "Precedent chain Route 64 → The Hideout → El Faro: each resolved by Code Enforcement reviewing permitted operating hours. Apply the same remedy, ask residents to log recurrences.",
      status: "open",
      occurrenceCount: 4,
      sourceMessageIds: [
        "<ce71934d89f4c02e@mail.bellwood-demo.gov>",
        "<now-e5f25a1e000e75d5@mail.bellwood-demo.gov>",
      ],
      firstSeen: "2026-06-11T18:39:00.877Z",
      lastSeen: "2026-06-28T06:40:00.000Z",
    },
    {
      agentKey: "constituent",
      kind: "open_issue",
      title: "2218 Bohland — failed deck reinspection (permit BP-2026-0351)",
      body:
        "Rosa Marchetti (Building) failed the reinspection 2026-06-22. Same property as the 2024-25 drainage saga — expect the owner in the inbox.",
      status: "open",
      occurrenceCount: 1,
      sourceMessageIds: ["<now-6b50612815343af1@mail.bellwood-demo.gov>"],
      firstSeen: "2026-06-22T21:51:00.877Z",
      lastSeen: "2026-06-22T21:51:00.877Z",
    },
  ],

  police: [
    {
      agentKey: "police",
      kind: "pattern",
      title: "Nightlife noise clusters on the St. Charles corridor",
      body:
        "Bar-noise blotter items (El Faro Cantina, June 7 summary) line up with live resident complaints at 511 St. Charles. Flagged to the constituent desk.",
      status: "open",
      occurrenceCount: 2,
      sourceMessageIds: [
        "<ce71934d89f4c02e@mail.bellwood-demo.gov>",
        "<d07273dcb01c36f7@mail.bellwood-demo.gov>",
      ],
      firstSeen: "2026-06-11T18:39:00.877Z",
      lastSeen: "2026-06-28T06:40:00.000Z",
    },
    {
      agentKey: "police",
      kind: "entity_note",
      title: "Jordan Auto Repair, 592 Frederick Ave — commercial burglary B26-77254",
      body: "Offense report filed; owner is a known correspondent. Expect a call to the Mayor's office.",
      status: "open",
      occurrenceCount: 1,
      sourceMessageIds: ["<now-563d60e408df4420@mail.bellwood-demo.gov>"],
      firstSeen: "2026-06-21T22:32:00.877Z",
      lastSeen: "2026-06-21T22:32:00.877Z",
    },
  ],

  fire: [
    {
      agentKey: "fire",
      kind: "pattern",
      title: "Run tempo normal — no structure fires this week",
      body: "Daily run reports June 18–19 show routine EMS and service calls only.",
      status: "open",
      occurrenceCount: 2,
      sourceMessageIds: [
        "<471512f8fb3a76be@mail.bellwood-demo.gov>",
        "<27e6b5ba41b6795b@mail.bellwood-demo.gov>",
      ],
      firstSeen: "2026-06-22T19:45:00.877Z",
      lastSeen: "2026-06-28T06:40:00.000Z",
    },
  ],

  council: [
    {
      agentKey: "council",
      kind: "open_issue",
      title: "Weekly FOIA log — one request awaiting the Mayor's sign-off",
      body: "The weekly log includes one request that needs your signature before the response goes out.",
      status: "open",
      occurrenceCount: 1,
      sourceMessageIds: ["<now-46a1c34c248f4c37@mail.bellwood-demo.gov>"],
      firstSeen: "2026-06-27T03:51:00.877Z",
      lastSeen: "2026-06-28T06:40:00.000Z",
    },
    {
      agentKey: "council",
      kind: "open_issue",
      title: "FOIA denial B26-79065 — appeal window open",
      body: "Yolanda Pierce issued the denial and flagged it for your awareness; know the grounds before an appeal lands.",
      status: "open",
      occurrenceCount: 1,
      sourceMessageIds: ["<now-69b455b65010df9f@mail.bellwood-demo.gov>"],
      firstSeen: "2026-06-27T06:37:00.877Z",
      lastSeen: "2026-06-27T06:37:00.877Z",
    },
    {
      agentKey: "council",
      kind: "commitment",
      title: "Taste of Bellwood — beer-garden addendum + tent permit to the board",
      body: "Kevin O'Brien's liquor-license addendum and temporary tent permit are queued for the next board packet.",
      status: "open",
      occurrenceCount: 2,
      sourceMessageIds: [
        "<now-8a546010eeda86ae@mail.bellwood-demo.gov>",
        "<now-54b369bffa6a3f54@mail.bellwood-demo.gov>",
      ],
      firstSeen: "2026-06-09T08:49:00.877Z",
      lastSeen: "2026-06-13T20:20:00.877Z",
    },
  ],

  schedule: [
    {
      agentKey: "schedule",
      kind: "commitment",
      title: "Water-main repair follow-up — St. Paul Ave at Wilcox St",
      body: "Thread reopened and aging; the repair follow-up is the oldest open commitment on the books.",
      status: "open",
      occurrenceCount: 2,
      sourceMessageIds: ["<now-a4a4aa7b462cd955@mail.bellwood-demo.gov>"],
      firstSeen: "2026-06-21T00:00:00.000Z",
      lastSeen: "2026-06-28T06:40:00.000Z",
    },
    {
      agentKey: "schedule",
      kind: "open_issue",
      title: "June 21 actionable-thread cluster — now overdue",
      body: "Hoarder/rat concern (Marshall Ave), salt-brine car damage, kennel noise/odor — all crossed the overdue line together.",
      status: "open",
      occurrenceCount: 3,
      sourceMessageIds: [
        "<now-63448071ef320508@mail.bellwood-demo.gov>",
        "<now-03156c457d106a60@mail.bellwood-demo.gov>",
        "<now-b3403ef7437d7e26@mail.bellwood-demo.gov>",
      ],
      firstSeen: "2026-06-21T22:50:00.877Z",
      lastSeen: "2026-06-28T06:40:00.000Z",
    },
    {
      agentKey: "schedule",
      kind: "entity_note",
      title: "Sofia's 16th — keep Sunday evening clear",
      body: "Family dinner Sunday 5:00 PM; sister visiting from Madison. Personal hold — no detail beyond the block.",
      status: "open",
      occurrenceCount: 1,
      sourceMessageIds: ["biz-023"],
      firstSeen: "2026-06-24T00:00:00.000Z",
      lastSeen: "2026-06-28T06:40:00.000Z",
    },
  ],
};
