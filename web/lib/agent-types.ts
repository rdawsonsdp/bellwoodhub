/*
 * agent-types.ts — the seed AGENT TYPE templates (client-safe), distilled from
 * today's roster per docs/rebuild/AGENT_FACTORY.md (DEC-12). Each type carries
 * the interview a new agent of that kind starts from and the connections it
 * will request. The Agent Builder (RB-6) runs these; until then this registry
 * powers the "Add an agent" preview so the growth story is visible on the Wall.
 */
export interface AgentTypeSeed {
  key: string;
  name: string;
  blurb: string;
  interview: string[]; // the opening interview questions (the Builder asks follow-ups)
  connections: string[]; // credentials/access requested during onboarding
}

export const AGENT_TYPES: AgentTypeSeed[] = [
  {
    key: "email-ingest",
    name: "Email agent",
    blurb: "Watches a mailbox and lands every message in the record (like the Outlook & Gmail agents).",
    interview: [
      "Which mailbox should this agent watch?",
      "Is it public record (FOIA-scoped) or private — walled off like the business Gmail?",
      "How often should it pull?",
    ],
    connections: ["Mailbox sign-in (read-only OAuth — Microsoft or Google)"],
  },
  {
    key: "domain-desk",
    name: "Domain desk",
    blurb: "A cabinet seat for one domain of village life (like Police, Fire, Council, Constituent).",
    interview: [
      "What domain is this desk responsible for?",
      "Who sends into it — which departments, senders, or topics?",
      "What counts as RED here — what must the Mayor see immediately?",
      "Should it draft replies, suggest next steps, or observe only?",
    ],
    connections: [],
  },
  {
    key: "entity-scope",
    name: "Entity watcher",
    blurb: "Follows exactly one business, property, or organization (like Harbor Wellness).",
    interview: [
      "Which entity should it watch?",
      "Is this private — should everything stay inside its own card?",
      "Which deadlines or filings matter most?",
    ],
    connections: [],
  },
  {
    key: "commitments",
    name: "Schedule & commitments",
    blurb: "Keeps promises and calendars honest (like the Schedule agent).",
    interview: [
      "Which calendars should it read?",
      "When is something 'overdue' — what's the grace period?",
      "Should personal holds appear, or government items only?",
    ],
    connections: ["Calendar access (read-only OAuth)"],
  },
  {
    key: "doc-connector",
    name: "Document connector",
    blurb: "Ingests a records system on a schedule (like the Police RMS and FOIA-portal connectors).",
    interview: [
      "What system or feed is the source?",
      "What's the sensitivity — public, internal, or restricted (secured storage)?",
      "How often does it publish?",
    ],
    connections: ["API key, SFTP credential, or portal address"],
  },
];
