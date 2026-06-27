/*
 * admin-config.ts — client-safe defaults for the Admin console. Mirrors the real
 * server config (lib/agents/constants.ts model router, lib/capabilities agents,
 * the canonical RLS/autonomy posture, and the demo Sources connectors) so the
 * panel reads true values. Demo-grade: the Admin UI persists overrides to
 * localStorage; it does not rewrite server config.
 */

export interface ModelOption { id: string; label: string; inPer1M: number; outPer1M: number; }

// Anthropic + OpenAI options the operator can route to. Rates are USD per 1M tokens.
export const MODEL_OPTIONS: ModelOption[] = [
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", inPer1M: 1.0, outPer1M: 5.0 },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", inPer1M: 3.0, outPer1M: 15.0 },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", inPer1M: 15.0, outPer1M: 75.0 },
  { id: "gpt-4o-mini", label: "OpenAI GPT-4o-mini", inPer1M: 0.15, outPer1M: 0.6 },
];

// The graduated-autonomy router (brief §8). 70/20/10 Haiku/Sonnet/Opus.
export interface RouteTier { task: string; label: string; model: string; note: string; }
export const ROUTER_DEFAULT: RouteTier[] = [
  { task: "classify", label: "Classification", model: "claude-haiku-4-5", note: "topic + stream tagging at ingest" },
  { task: "resolve", label: "Entity resolution", model: "claude-haiku-4-5", note: "alias matching / triage" },
  { task: "triage", label: "Triage", model: "claude-haiku-4-5", note: "what needs the Mayor" },
  { task: "synthesize", label: "Synthesis", model: "claude-sonnet-4-6", note: "grounded answers + timelines" },
  { task: "draft", label: "Drafting", model: "claude-sonnet-4-6", note: "reply drafts (R3 — never sends)" },
  { task: "flagship", label: "Flagship (gated)", model: "claude-opus-4-8", note: "highest-stakes only, behind eval" },
];

// Non-router models.
export const PIPELINE_MODELS = [
  { key: "answer", label: "Grounded answer (Ask)", model: "gpt-4o-mini" },
  { key: "embed", label: "Embeddings — inbox vectors", model: "text-embedding-3-small (1536d)" },
  { key: "embedCanonical", label: "Embeddings — canonical", model: "voyage-4-large (1024d)" },
  { key: "transcribe", label: "Voice transcription", model: "whisper-1" },
];

// ── Capability agents (brief §4) = the "skills" catalog ──
export type Autonomy = "R1" | "R2" | "R3" | "R4";
export interface Capability {
  key: string; name: string; autonomy: Autonomy; status: "built" | "partial" | "planned";
  desc: string; phase: number;
}
export const CAPABILITIES: Capability[] = [
  { key: "brief", name: "Morning Brief", autonomy: "R4", status: "built", phase: 0, desc: "What needs you today — newest inbound, open issues, high-sensitivity. Cites every line; states gaps." },
  { key: "memory", name: "Constituent / Property Memory", autonomy: "R1", status: "built", phase: 1, desc: "Everything we know about a person or address — full timeline across streams." },
  { key: "commitments", name: "Commitment Tracker", autonomy: "R1", status: "partial", phase: 2, desc: "Who promised what, and whether it happened. Hard-dollar accountability value." },
  { key: "drafting", name: "Drafting", autonomy: "R3", status: "built", phase: 3, desc: "Drafts replies in the Mayor's voice. Never sends — every send is a human gate." },
  { key: "compliance", name: "Compliance Watchtower", autonomy: "R2", status: "planned", phase: 2, desc: "FOIA / Open Meetings / retention posture — flags risk, never auto-acts." },
  { key: "board", name: "Board Prep", autonomy: "R3", status: "planned", phase: 3, desc: "Assembles council packets and briefing notes from the record." },
  { key: "grant", name: "Grant Radar", autonomy: "R3", status: "planned", phase: 3, desc: "Surfaces grant fits and deadlines against village needs." },
  { key: "intel", name: "Intelligence / Heat Map", autonomy: "R4", status: "planned", phase: 4, desc: "Cross-administration trends, hotspots, and institutional memory." },
];

// ── Graduated-autonomy ladder (the agent governance rules) ──
export interface AutonomyRule { level: Autonomy; title: string; rule: string; }
export const AUTONOMY_LADDER: AutonomyRule[] = [
  { level: "R1", title: "Read-only", rule: "Reads the canonical store and answers with citations. No writes, no actions." },
  { level: "R2", title: "Suggest + queue", rule: "May propose entity merges / flags into a human review queue. No silent hard-merge; every assertion reversible." },
  { level: "R3", title: "Draft, never send", rule: "Drafts replies and actions but never executes. Every send/approve is a human gate (the Mayor decides)." },
  { level: "R4", title: "Honest-gap digest", rule: "Summarizes proactively, but states empty sections rather than omitting them, and cites sources for every claim." },
];

// ── Sources / connectors (the ingestion plane, brief §4) ──
export interface SourceDef {
  key: string; name: string; kind: string; enabled: boolean; schedule: string;
  status: "healthy" | "syncing" | "degraded" | "off";
}
export const SOURCES_DEFAULT: SourceDef[] = [
  { key: "exchange", name: "Mayor's Exchange mailbox", kind: "IMAP / Graph", enabled: true, schedule: "every 5 min", status: "healthy" },
  { key: "police", name: "Police RMS (incident reports)", kind: "Nightly CSV", enabled: true, schedule: "daily 02:00", status: "healthy" },
  { key: "fire", name: "Fire / EMS NFIRS feed", kind: "API", enabled: true, schedule: "daily 02:00", status: "healthy" },
  { key: "crm", name: "311 / constituent CRM", kind: "REST API", enabled: true, schedule: "every 15 min", status: "syncing" },
  { key: "foia", name: "FOIA / records portal", kind: "Scrape", enabled: true, schedule: "hourly", status: "healthy" },
  { key: "finance", name: "Finance / utility billing", kind: "Legacy CSV (SFTP)", enabled: false, schedule: "weekly", status: "degraded" },
];

// ── Cost model (brief §8 / §10) ──
export const COST_MODEL = {
  blendedPerQuestion: 0.008, // < 1¢ at retrieval
  oneTimeEmbedLow: 30,
  oneTimeEmbedHigh: 80,
  monthlyLow: 50,
  monthlyHigh: 120,
  split: { haiku: 70, sonnet: 20, opus: 10 },
  levers: ["Prompt caching (cache reads ≈10% of input rate)", "Batch API (50% off async work)", "Context discipline (planner sends only the retrieved set)"],
};
