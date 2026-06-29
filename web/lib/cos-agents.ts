/*
 * cos-agents.ts — the Staff Agent registry (client-safe). The single source of
 * truth for "which agent does the work" behind each screen, its autonomy level,
 * what it produces, and its recent activity. This is a READ-ONLY UX view of the
 * agents for the Mayor — agents are configured/tested in Claude Code, not here.
 */
export type Autonomy = "R1" | "R2" | "R3" | "R4";

export interface CosAgent {
  key: string;
  name: string;
  autonomy: Autonomy;
  status: "active" | "partial" | "planned";
  powers: string[];   // screens / areas it serves
  role: string;       // one line
  job: string;        // what work it actually does
  produces: string;   // its output
  recent: string[];   // recent activity (most recent first)
  spec?: string;      // repo path to the full agent definition (.md) — the deep
                      // jobs/roles live in the repo, not the UX, so the team scales.
}

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  R1: "Read-only · cites sources",
  R2: "Suggests · human review queue",
  R3: "Drafts · never sends (human gate)",
  R4: "Proactive digest · honest gaps",
};

export const COS_AGENTS: CosAgent[] = [
  {
    key: "chief", name: "Chief of Staff", autonomy: "R4", status: "active", powers: ["Today", "Morning briefing"],
    role: "Greets the Mayor and runs his morning.",
    job: "Reads the output of every other agent — email, calendar, drafting, history, search — and folds it into one spoken-style morning briefing: what happened overnight, what's new, and what's most important today. Surfaces the day's calendar and the drafts waiting to be signed, all on the first screen, in a configurable personal voice. States gaps honestly; never sends.",
    produces: "The 'Good morning' Today briefing on the landing screen.",
    recent: ["Briefed the Mayor — 11 need you, 3 to sign, 8 on the calendar · 6:40 AM", "Summarized overnight activity across 5 agent desks · 6:40 AM", "Flagged the most pressing item for your eyes · 6:40 AM"],
  },
  {
    key: "email-outlook", name: "Outlook Email Agent", autonomy: "R1", status: "active", powers: ["Emails · Government", "Sources"],
    role: "Ingests the Mayor's government mailbox (Outlook).",
    job: "Pulls the Bellwood Government mailbox (mayor@villageofbellwood.gov) via Microsoft Graph and runs the 5-step connector contract — pull → normalize → resolve identities → classify topic/stream → index + embed — landing every message as a canonical record. Public record: FOIA-scoped and part of AI Search. Read-only ingestion; it never sends.",
    produces: "The Government inbox + searchable email corpus.",
    recent: ["Pulled 38 new messages from Outlook · 7:02 AM", "Resolved 'G. Bennett' → Gloria Bennett on a new thread · 7:02 AM", "Classified 12 messages into Police / Fire / Resident streams · 7:02 AM"],
    spec: "docs/agents/email-outlook-agent.md",
  },
  {
    key: "email-gmail", name: "Gmail Email Agent", autonomy: "R1", status: "active", powers: ["Emails · Business", "Sources"],
    role: "Ingests the Mayor's private business mailbox (Gmail).",
    job: "Pulls the Bellwood Business mailbox (merrill.bellwood@gmail.com) via the Gmail API and runs the same 5-step contract. WALLED (DEC-6): this account is private — not FOIA-indexed and excluded from default AI Search. Read-only ingestion; never sends; keeps business mail separate from the public record.",
    produces: "The walled Business inbox (private).",
    recent: ["Pulled 4 new messages from Gmail · 7:02 AM", "Flagged a dispensary METRC compliance email · 7:02 AM", "Kept business mail out of the FOIA index · 7:02 AM"],
    spec: "docs/agents/email-gmail-agent.md",
  },
  {
    key: "brief", name: "Morning Brief Agent", autonomy: "R4", status: "active", powers: ["Emails", "Brief"],
    role: "Tells the Mayor what needs them today.",
    job: "Scans overnight correspondence and folds it into a digest: newest inbound awaiting a reply, open issues, and high-sensitivity (FOIA / public-safety) mail. States empty sections rather than hiding them; every line cites its source.",
    produces: "The 'Needs you' / Brief digest.",
    recent: ["Assembled today's brief — 14 items, 3 high-sensitivity · 6:11 AM", "Re-folded 'Greenwood Ave flooding' back to open (out-of-order email) · 6:11 AM", "Flagged 2 FOIA requests for your eyes · yesterday"],
  },
  {
    key: "drafting", name: "Drafting Agent", autonomy: "R3", status: "active", powers: ["Approvals", "Emails · Agent Answered"],
    role: "Writes replies in the Mayor's voice — but never sends.",
    job: "When an inbound email needs a response, drafts a reply (warm but busy, sets expectations, routes to the right department) using only the known context for that thread. It will not invent facts. The draft is queued as pending with a rationale.",
    produces: "Pending draft replies. The Mayor approves or discards; sending is a separate human step.",
    recent: ["Drafted reply to Eleanor Meyer — regrade date · 2h ago", "Drafted reply to Gloria Bennett — storm drain · 2h ago", "Drafted reply to Diane Pawlak — St. Charles noise · 3h ago"],
  },
  {
    key: "events", name: "Commitment & Calendar Agent", autonomy: "R1", status: "active", powers: ["Calendar"],
    role: "Surfaces what the Mayor has to do, by date.",
    job: "Folds actionable threads into events and derives status from the thread — responded → done, stale inbound → overdue, recent inbound → open. (Will sync the Mayor's MS Outlook calendar next.)",
    produces: "The Calendar agenda with open / overdue / done status.",
    recent: ["Marked 'Water-main bid' overdue · today", "Folded 6 new actionable threads into the calendar · today", "Closed 'storm-sewer survey' (resolved) · 2d ago"],
  },
  {
    key: "hr", name: "HR Agent", autonomy: "R3", status: "planned", powers: ["Staff", "Tasks"],
    role: "Handles staff tasks — onboarding, certifications, reminders.",
    job: "Drafts HR tasks and reminders (onboarding checklists, expiring certifications, benefits enrollment) and routes them to the right person. Drafts and proposes; never auto-acts.",
    produces: "HR task drafts & reminders (planned).",
    recent: ["Drafted a new-hire onboarding checklist for Public Works · yesterday", "Flagged 2 expiring Fire certifications · today", "Scheduled a benefits-enrollment reminder · 3d ago"],
  },
  {
    key: "memory", name: "History Agent", autonomy: "R1", status: "active", powers: ["History"],
    role: "Everything we know about a person or property.",
    job: "Resolves identities via the assertion ledger (reversible) and assembles the complete cross-stream timeline for any constituent, business, or address, with issue and commitment counts.",
    produces: "Entity profiles + full timelines on the History screen.",
    recent: ["Resolved 'G. Bennett' → Gloria Bennett (alias) · today", "Built the timeline for 1733 Frederick Ave · yesterday", "Queued an ambiguous merge for review · 2d ago"],
  },
  {
    key: "retrieval", name: "AI Search Agent", autonomy: "R1", status: "active", powers: ["AI Search"],
    role: "Answers any question over the record, with citations.",
    job: "Decomposes the question (aggregate vs. RAG), retrieves the complete candidate set, ranks it, and synthesizes a grounded answer using only the retrieved sources — every claim carries an [n] citation; flags cross-source answers.",
    produces: "Cited answers + source cards in AI Search.",
    recent: ["Answered 'history with Gloria Bennett' — 8 sources · just now", "Answered 'St. Charles noise precedent' — cross-source · 1h ago", "Flagged a gap: no records for that query · yesterday"],
  },
  {
    key: "resolver", name: "Resolver & Ingestion Agent", autonomy: "R2", status: "partial", powers: ["Sources"],
    role: "Lands data cleanly and keeps identities honest.",
    job: "Runs the connector contract (pull → normalize → resolve → classify → index) and entity resolution. Ambiguous merges go to a human review queue — no silent hard-merge; every assertion is reversible.",
    produces: "Connector health + the entity review queue on Sources.",
    recent: ["Ingested the overnight Police RMS batch — 12 reports · 2:00 AM", "Parked 1 name collision for review · today", "Re-synced the 311 CRM · 15m ago"],
  },
  {
    key: "compliance", name: "Compliance Watchtower", autonomy: "R2", status: "planned", powers: ["Sources"],
    role: "Flags FOIA / Open Meetings / retention risk.",
    job: "Watches the record for records-posture and compliance risk and flags it for review — never auto-acts.",
    produces: "Compliance flags (planned).",
    recent: [],
  },
  {
    key: "board", name: "Board Prep Agent", autonomy: "R3", status: "planned", powers: ["—"],
    role: "Assembles council packets from the record.",
    job: "Drafts briefing notes and council packets from the institutional record; human-approved before use.",
    produces: "Draft board packets (planned).",
    recent: [],
  },
  {
    key: "grant", name: "Grant Radar", autonomy: "R3", status: "planned", powers: ["—"],
    role: "Surfaces grant fits and deadlines.",
    job: "Matches grant opportunities and deadlines against village needs; proposes, never files.",
    produces: "Grant leads (planned).",
    recent: [],
  },
  {
    key: "intel", name: "Intelligence / Heat Map", autonomy: "R4", status: "planned", powers: ["—"],
    role: "Cross-administration trends and hotspots.",
    job: "Surfaces trends, hotspots, and cross-administration institutional memory.",
    produces: "Trend / heat-map views (planned).",
    recent: [],
  },
];

export const agentByKey = (key: string) => COS_AGENTS.find((a) => a.key === key);
