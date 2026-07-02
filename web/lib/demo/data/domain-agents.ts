/*
 * domain-agents.ts (fixtures) — one hand-authored AgentRunOutput per ACTIVE
 * domain agent, built on the existing hero scenarios (Meyer saga, Bennett,
 * St. Charles noise precedent, 2218 Bohland, police blotter, Taste of
 * Bellwood, FOIA). This is what the Wall/Queue render in DEMO mode until the
 * Phase 5 orchestrator writes real runs.
 *
 * Invariants these fixtures must hold (validated by web/eval):
 *   - every digest point and actItem cites messageIds that resolve in the
 *     demo corpora (search-index / business-inbox / corpus-docs);
 *   - actItems only on "draft" agents (constituent);
 *   - the El Faro bar-noise blotter thread <ce71934d89f4c02e@…> appears in
 *     BOTH police and constituent digests — the dual-domain item that proves
 *     presentation-layer dedup in Phase 2;
 *   - the constituent actItems are the three seeded drafts (Meyer / Bennett /
 *     Pawlak), re-signed Mayor Merrill Bellwood (Phase 0 decision).
 */
import type { AgentRun } from "../../agent-run";

/** The demo's "last run" stamp — the cabinet's 6:40 AM briefing pass. */
export const DEMO_RUN_AT = "2026-06-28T06:40:00.000Z";

export const DEMO_AGENT_RUNS: AgentRun[] = [
  {
    agentKey: "police",
    ranAt: DEMO_RUN_AT,
    output: {
      headline: "Quiet overnight — one burglary follow-up and a noise pattern you'll hear about.",
      urgency: "yellow",
      digest: [
        {
          point:
            "June 20 overnight summary is routine: a 2:21 am noise complaint, no arrests of note.",
          sourceMessageIds: ["<d07273dcb01c36f7@mail.bellwood-demo.gov>"],
        },
        {
          point:
            "Commercial burglary at Jordan Auto Repair, 592 Frederick Ave (offense report B26-77254) — the owner is a known correspondent; expect a call.",
          sourceMessageIds: ["<now-563d60e408df4420@mail.bellwood-demo.gov>"],
        },
        {
          point:
            "Watch commander flagged battery report B23-81882 filed near St. Paul Ave for your awareness.",
          sourceMessageIds: ["<now-2e530a66a45a4c46@mail.bellwood-demo.gov>"],
        },
        {
          point:
            "Bar-noise blotter item at El Faro Cantina (June 7 summary) matches the live resident complaint on the St. Charles corridor — flagged to the constituent desk.",
          sourceMessageIds: [
            "<ce71934d89f4c02e@mail.bellwood-demo.gov>",
            "<now-e5f25a1e000e75d5@mail.bellwood-demo.gov>",
          ],
        },
        {
          point:
            "Illegal firearm recovered at a 26th Ave traffic stop (weapons report B25-64295) — closed cleanly, no injuries.",
          sourceMessageIds: ["<now-cae8209cd21bd8c5@mail.bellwood-demo.gov>"],
        },
      ],
      actItems: [], // observe — never drafts
      memoryOps: [
        {
          op: "upsert",
          kind: "pattern",
          title: "Nightlife noise clusters on the St. Charles corridor",
          sourceMessageIds: ["<d07273dcb01c36f7@mail.bellwood-demo.gov>"],
        },
        {
          op: "upsert",
          kind: "entity_note",
          title: "Jordan Auto Repair, 592 Frederick Ave — commercial burglary B26-77254",
          sourceMessageIds: ["<now-563d60e408df4420@mail.bellwood-demo.gov>"],
        },
      ],
    },
  },

  {
    agentKey: "fire",
    ranAt: DEMO_RUN_AT,
    output: {
      headline: "Routine tempo — daily runs normal, no structure fires this week.",
      urgency: "clear",
      digest: [
        {
          point: "June 19 daily run report: routine EMS and service calls; tempo normal.",
          sourceMessageIds: ["<471512f8fb3a76be@mail.bellwood-demo.gov>"],
        },
        {
          point: "June 18 daily run report: routine; hydrant flow tests continue on schedule.",
          sourceMessageIds: ["<27e6b5ba41b6795b@mail.bellwood-demo.gov>"],
        },
        {
          point:
            "The Eastern Ave response report is on file in the records corpus — relevant if the drainage threads resurface.",
          sourceMessageIds: ["doc-001"],
        },
      ],
      actItems: [], // observe — never drafts
      memoryOps: [
        {
          op: "upsert",
          kind: "pattern",
          title: "Run tempo normal — no structure fires this week",
          sourceMessageIds: ["<471512f8fb3a76be@mail.bellwood-demo.gov>"],
        },
      ],
    },
  },

  {
    agentKey: "council",
    ranAt: DEMO_RUN_AT,
    output: {
      headline: "The weekly FOIA log is waiting on your sign-off; one denial worth knowing about.",
      urgency: "yellow",
      digest: [
        {
          point: "The weekly FOIA log includes one request that needs your signature before the response goes out.",
          sourceMessageIds: ["<now-46a1c34c248f4c37@mail.bellwood-demo.gov>"],
        },
        {
          point:
            "FOIA on pending development applications for 3576 Harvard Ave — Yolanda Pierce has responded; a follow-up from the requester is likely.",
          sourceMessageIds: [
            "<now-18291ada8d0cf970@mail.bellwood-demo.gov>",
            "<now-e6415f007424d9f6@mail.bellwood-demo.gov>",
          ],
        },
        {
          point:
            "FOIA denial B26-79065 was issued — worth knowing the grounds before an appeal lands on your desk.",
          sourceMessageIds: ["<now-69b455b65010df9f@mail.bellwood-demo.gov>"],
        },
        {
          point:
            "Taste of Bellwood: the beer-garden liquor addendum and the temporary tent permit are queued for the next board packet.",
          sourceMessageIds: [
            "<now-8a546010eeda86ae@mail.bellwood-demo.gov>",
            "<now-54b369bffa6a3f54@mail.bellwood-demo.gov>",
          ],
        },
        {
          point: "FOIA request 2026-114 remains open in the records corpus.",
          sourceMessageIds: ["doc-009"],
        },
      ],
      actItems: [], // suggest — proposes, never drafts
      memoryOps: [
        {
          op: "upsert",
          kind: "open_issue",
          title: "Weekly FOIA log — one request awaiting the Mayor's sign-off",
          sourceMessageIds: ["<now-46a1c34c248f4c37@mail.bellwood-demo.gov>"],
        },
      ],
    },
  },

  {
    agentKey: "constituent",
    ranAt: DEMO_RUN_AT,
    output: {
      headline: "Eleanor Meyer flooded a third time — the promised regrade is now the complaint.",
      urgency: "red",
      digest: [
        {
          point:
            "Eleanor Meyer's basement flooded again Saturday — third time since March. The Frederick Ave regrade was estimated April 27 and still has no start date; Public Works replied without committing to one. This is a broken commitment, not a new ticket.",
          sourceMessageIds: [
            "<now-4719fd94f5ae0394@mail.bellwood-demo.gov>",
            "<now-3cc8a08531f64b9d@mail.bellwood-demo.gov>",
            "<a2-c40b404847838f18@mail.bellwood-demo.gov>",
          ],
        },
        {
          point:
            "Gloria Bennett (seventh contact, always civil) reports the storm drain flooding her crosswalk. Tom Reyes' storm-sewer televising results for the 25th Ave area landed June 20 — the inspection can cite them.",
          sourceMessageIds: [
            "<3f209918174003cb@mail.bellwood-demo.gov>",
            "<now-860dfa738b450f15@mail.bellwood-demo.gov>",
          ],
        },
        {
          point:
            "Diane Pawlak: bar noise until 2 am again at 511 St. Charles. The June 7 blotter logged the same corridor pattern at El Faro; the operating-hours-review remedy has worked three times on this street.",
          sourceMessageIds: [
            "<now-e5f25a1e000e75d5@mail.bellwood-demo.gov>",
            "<ce71934d89f4c02e@mail.bellwood-demo.gov>",
          ],
        },
        {
          point:
            "Building failed the deck reinspection at 2218 Bohland (permit BP-2026-0351) — the owner will likely write to you next; the property has a drainage history.",
          sourceMessageIds: ["<now-6b50612815343af1@mail.bellwood-demo.gov>"],
        },
        {
          point:
            "Eugene Ferguson suggests more shade at the Taste of Bellwood — goodwill reply, low stakes.",
          sourceMessageIds: ["<now-c9a0550fe042d21a@mail.bellwood-demo.gov>"],
        },
      ],
      actItems: [
        {
          type: "draft_reply",
          threadId: "now-thr-6abdde046d94",
          draftSubject: "Re: Basement flooded AGAIN after Saturday's storm — where is the regrade?",
          draftBody:
            "Dear Mrs. Meyer,\n\nThank you for writing again, and I'm sorry you're dealing with water in the basement after this weekend's storm — especially after we discussed the regrade. That's not where this should still be.\n\nI've asked Public Works for a firm date on the Frederick Ave regrade and the storm-drain work tied to your property, and I've flagged your address as a repeat issue so it isn't treated as a new ticket. You should hear a specific date from my office by the end of the week; if you don't, reply to this email and it comes straight back to me.\n\nThank you for your patience.\n\n— Mayor Merrill Bellwood",
          rationale:
            "Repeat constituent (5-thread saga since Sep 2025); the regrade was promised and is overdue. Acknowledges the prior commitment, routes to Public Works, sets a concrete expectation without over-promising a completion date.",
          citations: [
            "<now-4719fd94f5ae0394@mail.bellwood-demo.gov>",
            "<a2-c40b404847838f18@mail.bellwood-demo.gov>",
            "<a2-4a79f4293d46a2ad@mail.bellwood-demo.gov>",
          ],
        },
        {
          type: "draft_reply",
          threadId: "thr-1bd69b6a2c64",
          draftSubject: "Re: Storm drain flooding the crosswalk at my corner",
          draftBody:
            "Dear Ms. Bennett,\n\nThank you for flagging the storm drain at your corner — a flooded crosswalk is a safety issue, not just an inconvenience, and I appreciate you reporting it.\n\nI've routed this to Public Works for a catch-basin inspection at your intersection. Given our past few exchanges (and thank you again for the kind note on the water bill), I'll personally check that this one doesn't sit. Expect an update on the inspection within several business days.\n\nWarm regards,\n\n— Mayor Merrill Bellwood",
          rationale:
            "Seven-contact history; consistently civil repeat constituent whose latest message is unanswered. Routes the storm-drain report to Public Works, references the prior rapport, commits to a follow-up without a hard deadline.",
          citations: [
            "<3f209918174003cb@mail.bellwood-demo.gov>",
            "<now-860dfa738b450f15@mail.bellwood-demo.gov>",
          ],
        },
        {
          type: "draft_reply",
          threadId: "now-thr-7ae8ce60f226",
          draftSubject: "Re: Bar noise until 2am AGAIN this weekend — 511 St. Charles",
          draftBody:
            "Dear Ms. Pawlak,\n\nThank you for letting me know, and I'm sorry the late-night noise is back. You shouldn't have to lose sleep over this.\n\nWe've resolved very similar complaints on St. Charles Rd before by having Code Enforcement review the establishment's permitted operating hours, and I've asked them to do the same here for 511 St. Charles. I'll have someone follow up with you on what they find. If it happens again before then, note the date and time and send it to me — a log helps Code Enforcement act.\n\nThank you,\n\n— Mayor Merrill Bellwood",
          rationale:
            "Live noise complaint with a clear precedent (Route 64 → The Hideout → El Faro, each resolved via operating-hours review) and a corroborating blotter item. Applies the known remedy, routes to Code Enforcement, asks the resident to log recurrences.",
          citations: [
            "<now-e5f25a1e000e75d5@mail.bellwood-demo.gov>",
            "<ce71934d89f4c02e@mail.bellwood-demo.gov>",
          ],
        },
      ],
      memoryOps: [
        {
          op: "upsert",
          kind: "commitment",
          title: "Frederick Ave regrade — 1733 Frederick Ave (Eleanor Meyer)",
          entityId: "demo-ent-2",
          sourceMessageIds: ["<now-4719fd94f5ae0394@mail.bellwood-demo.gov>"],
        },
        {
          op: "upsert",
          kind: "pattern",
          title: "St. Charles corridor late-night noise — remedy: operating-hours review",
          sourceMessageIds: ["<now-e5f25a1e000e75d5@mail.bellwood-demo.gov>"],
        },
        {
          op: "upsert",
          kind: "open_issue",
          title: "2218 Bohland — failed deck reinspection (permit BP-2026-0351)",
          sourceMessageIds: ["<now-6b50612815343af1@mail.bellwood-demo.gov>"],
        },
      ],
    },
  },

  {
    // The Phase-5 config-only proof: this fixture + the registry flag are the
    // ENTIRE activation. Walled: renders only as its own Private card — never
    // in needsYouNow, never in the government footer (provider-enforced).
    agentKey: "harbor-wellness",
    ranAt: DEMO_RUN_AT,
    output: {
      headline: "License renewal is on the clock; Brink's moved your cash pickup to Tuesday.",
      urgency: "yellow",
      digest: [
        {
          point:
            "IDFPR annual dispensing-organization renewal is due July 31 — fee, surety bond, and compliance attestation. Whitfield CPA has the financials; the bond needs your signature.",
          sourceMessageIds: ["biz-015"],
        },
        {
          point:
            "Brink's moved the armored pickup to Tuesday 10:30 AM — a manager with safe access must be on site for the new window.",
          sourceMessageIds: ["biz-017"],
        },
        {
          point: "METRC compliance notice received — inventory reconciliation is current; no action beyond the acknowledgment.",
          sourceMessageIds: ["biz-016"],
        },
        {
          point:
            "Maya reports Saturday demand outpacing staffing again; budtender hiring and the security schedule are on Monday's P&L agenda.",
          sourceMessageIds: ["biz-018"],
        },
        {
          point: "Harbor Wellness is nominated for the Chamber's New Business of the Year (dinner July 9).",
          sourceMessageIds: ["biz-022"],
        },
      ],
      actItems: [], // draft ceiling, but walled drafts stay out of the gov Queue — none seeded
      memoryOps: [
        {
          op: "upsert",
          kind: "commitment",
          title: "IDFPR license renewal — file by July 31",
          sourceMessageIds: ["biz-015"],
        },
        {
          op: "upsert",
          kind: "pattern",
          title: "Saturday demand outpacing staffing",
          sourceMessageIds: ["biz-018"],
        },
      ],
    },
  },

  {
    agentKey: "schedule",
    ranAt: DEMO_RUN_AT,
    output: {
      headline: "Today is clear — but last week's commitment cluster is now overdue.",
      urgency: "yellow",
      digest: [
        {
          point:
            "The June 21 actionable-thread cluster crossed the overdue line together: hoarder/rat concern on Marshall Ave, salt-brine car damage, kennel noise and odor.",
          sourceMessageIds: [
            "<now-63448071ef320508@mail.bellwood-demo.gov>",
            "<now-03156c457d106a60@mail.bellwood-demo.gov>",
            "<now-b3403ef7437d7e26@mail.bellwood-demo.gov>",
          ],
        },
        {
          point:
            "The water-main repair follow-up (St. Paul Ave at Wilcox St) is the oldest open commitment on the books and still aging.",
          sourceMessageIds: ["<now-a4a4aa7b462cd955@mail.bellwood-demo.gov>"],
        },
        {
          point:
            "Washington Blvd stormwater capital project — the 60% design and grant update deserves a read before the next board meeting.",
          sourceMessageIds: ["<now-e9652018742e7695@mail.bellwood-demo.gov>"],
        },
        {
          point: "Personal: Sofia's 16th birthday dinner Sunday evening — keeping it clear.",
          sourceMessageIds: ["biz-023"],
        },
      ],
      actItems: [], // suggest — proposes holds, never drafts
      memoryOps: [
        {
          op: "upsert",
          kind: "commitment",
          title: "Water-main repair follow-up — St. Paul Ave at Wilcox St",
          sourceMessageIds: ["<now-a4a4aa7b462cd955@mail.bellwood-demo.gov>"],
        },
        {
          op: "upsert",
          kind: "open_issue",
          title: "June 21 actionable-thread cluster — now overdue",
          sourceMessageIds: ["<now-63448071ef320508@mail.bellwood-demo.gov>"],
        },
      ],
    },
  },
];

export const demoRunForAgent = (key: string): AgentRun | undefined =>
  DEMO_AGENT_RUNS.find((r) => r.agentKey === key);
