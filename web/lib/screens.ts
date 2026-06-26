/*
 * screens.ts — data for the Chief of Staff desktop screens (Memory · Sources ·
 * Approvals). Read-only over canonical except the explicit human actions
 * (resolveReview merge/reject; draft approve/discard), all of which are
 * reversible or non-sending (R3). The capability digest (Brief) lives in
 * capabilities.ts.
 */
import { query } from "./db";
import { getEntity } from "./retrieval-canonical";
import { draftReply } from "./capabilities";
import type { StreamKey, TimelineMessage } from "./types";

const TENANT = "00000000-0000-0000-0000-000000000001";
const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

// ───────────────────────── MEMORY ─────────────────────────
export interface EntityListItem { entityId: string; name: string; kind: string; count: number; }

export async function memoryList(): Promise<EntityListItem[]> {
  const rows = await query<{ entity_id: string; canonical_name: string; entity_type: string; n: number }>(
    `SELECT en.entity_id, en.canonical_name, en.entity_type, count(m.message_id)::int AS n
       FROM canonical.entities en
       JOIN canonical.entity_aliases ea ON ea.entity_id = en.entity_id AND ea.retracted_at IS NULL
       LEFT JOIN canonical.messages m ON m.sender_alias_id = ea.alias_id
      WHERE en.tenant_id = $1
      GROUP BY en.entity_id, en.canonical_name, en.entity_type
      HAVING count(m.message_id) > 0
      ORDER BY n DESC LIMIT 40`,
    [TENANT],
  );
  return rows.map((r) => ({ entityId: r.entity_id, name: r.canonical_name, kind: r.entity_type, count: r.n }));
}

export interface AliasChip { value: string; type: string; source: string; confidence: number; }
export interface MemoryDetail {
  value: string;
  kind: string;
  stats: { count: number; firstDate: string | null; lastDate: string | null; streams: StreamKey[]; issues: number; commitments: number };
  aliases: AliasChip[];
  timeline: TimelineMessage[];
}

export async function memoryDetail(value: string): Promise<MemoryDetail | null> {
  const ent = await query<{ entity_id: string; entity_type: string }>(
    `SELECT ea.entity_id, en.entity_type
       FROM canonical.entity_aliases ea JOIN canonical.entities en ON en.entity_id = ea.entity_id
      WHERE ea.tenant_id = $1 AND ea.retracted_at IS NULL AND lower(ea.alias_value) = lower($2) LIMIT 1`,
    [TENANT, value],
  );
  if (!ent.length) return null;
  const entityId = ent[0].entity_id;
  const aliases = await query<{ alias_value: string; alias_type: string; source: string; confidence: number }>(
    `SELECT alias_value, alias_type, source, confidence FROM canonical.entity_aliases
      WHERE entity_id = $1 AND retracted_at IS NULL ORDER BY confidence DESC, alias_type`,
    [entityId],
  );
  const e = await getEntity("person", value);
  const counts = await query<{ issues: number; commitments: number }>(
    `SELECT
       (SELECT count(DISTINCT t.issue_id) FROM canonical.threads t
          JOIN canonical.messages m ON m.thread_id = t.thread_id
          JOIN canonical.entity_aliases ea ON ea.alias_id = m.sender_alias_id
         WHERE ea.entity_id = $1 AND t.issue_id IS NOT NULL)::int AS issues,
       (SELECT count(*) FROM canonical.commitments WHERE owner_entity_id = $1)::int AS commitments`,
    [entityId],
  );
  return {
    value,
    kind: ent[0].entity_type,
    stats: { ...e.stats, issues: counts[0]?.issues ?? 0, commitments: counts[0]?.commitments ?? 0 },
    aliases: aliases.map((a) => ({ value: a.alias_value, type: a.alias_type, source: a.source, confidence: Number(a.confidence) })),
    timeline: e.messages,
  };
}

// ───────────────────────── SOURCES ─────────────────────────
export interface ConnectorHealth {
  source: string; total: number; canonical: number; dead: number; pct: number;
  lastSynced: string | null; status: "healthy" | "degraded" | "syncing";
}
export interface ReviewItem {
  reviewId: string; aliasValue: string; existingName: string | null; incomingName: string | null; confidence: number; kind: string;
}
export interface SourcesOverview {
  totals: { messages: number; embedded: number; entities: number };
  connectors: ConnectorHealth[];
  review: ReviewItem[];
  healthy: number;
}

export async function sourcesOverview(): Promise<SourcesOverview> {
  const conn = await query<{ source: string; total: number; canonical: number; dead: number; last: Date | null }>(
    `SELECT source, count(*)::int AS total, count(*) FILTER (WHERE state='canonical')::int AS canonical,
            count(*) FILTER (WHERE state='dead_lettered')::int AS dead, max(landed_at) AS last
       FROM pipeline.ingest_log GROUP BY source ORDER BY total DESC`,
  );
  const totals = await query<{ messages: number; embedded: number; entities: number }>(
    `SELECT (SELECT count(*) FROM canonical.messages)::int AS messages,
            (SELECT count(*) FROM canonical.chunks WHERE embedding IS NOT NULL)::int AS embedded,
            (SELECT count(*) FROM canonical.entities)::int AS entities`,
  );
  const review = await query<{ review_id: string; alias_value: string; kind: string; confidence: number; existing: string | null; incoming: string | null }>(
    `SELECT r.review_id, r.alias_value, r.kind, r.confidence,
            (SELECT canonical_name FROM canonical.entities WHERE entity_id = r.existing_entity_id) AS existing,
            (SELECT canonical_name FROM canonical.entities WHERE entity_id = r.incoming_entity_id) AS incoming
       FROM pipeline.review_queue r WHERE r.status = 'pending' ORDER BY r.created_at DESC LIMIT 25`,
  );
  const connectors: ConnectorHealth[] = conn.map((c) => ({
    source: c.source, total: c.total, canonical: c.canonical, dead: c.dead,
    pct: c.total ? Math.round((100 * c.canonical) / c.total) : 0,
    lastSynced: c.last ? c.last.toISOString() : null,
    status: c.dead > 0 ? "degraded" : c.canonical < c.total ? "syncing" : "healthy",
  }));
  return {
    totals: totals[0] ?? { messages: 0, embedded: 0, entities: 0 },
    connectors,
    review: review.map((r) => ({ reviewId: r.review_id, aliasValue: r.alias_value, existingName: r.existing, incomingName: r.incoming, confidence: Number(r.confidence), kind: r.kind })),
    healthy: connectors.filter((c) => c.status === "healthy").length,
  };
}

/** Human review action — reversible (R2). Merge asserts the alias on the existing identity. */
export async function resolveReview(reviewId: string, action: "merge" | "reject"): Promise<void> {
  const rows = await query<{ alias_value: string; existing_entity_id: string | null }>(
    `SELECT alias_value, existing_entity_id FROM pipeline.review_queue WHERE review_id = $1 AND status = 'pending'`,
    [reviewId],
  );
  const r = rows[0];
  if (!r) return;
  if (action === "reject") {
    await query(`UPDATE pipeline.review_queue SET status = 'rejected' WHERE review_id = $1`, [reviewId]);
    return;
  }
  if (r.existing_entity_id) {
    await query(
      `INSERT INTO canonical.entity_aliases (tenant_id, entity_id, alias_type, alias_value, alias_norm, source, confidence)
       VALUES ($1, $2, 'name_variant', $3, $4, 'review_merge', 1.0)
       ON CONFLICT (tenant_id, alias_type, alias_norm) WHERE retracted_at IS NULL DO NOTHING`,
      [TENANT, r.existing_entity_id, r.alias_value, norm(r.alias_value)],
    );
  }
  await query(`UPDATE pipeline.review_queue SET status = 'merged' WHERE review_id = $1`, [reviewId]);
}

// ───────────────────────── APPROVALS / DRAFTS ─────────────────────────
export interface DraftRow {
  draftId: string; agent: string; kind: string; toMessageId: string | null;
  recipients: string | null; subject: string | null; body: string; rationale: string | null;
  status: string; createdAt: string;
}
type DraftDb = { draft_id: string; agent: string; kind: string; to_message_id: string | null; recipients: string | null; subject: string | null; body: string; rationale: string | null; status: string; created_at: Date };
const mapDraft = (r: DraftDb): DraftRow => ({
  draftId: r.draft_id, agent: r.agent, kind: r.kind, toMessageId: r.to_message_id,
  recipients: r.recipients, subject: r.subject, body: r.body, rationale: r.rationale,
  status: r.status, createdAt: r.created_at.toISOString(),
});

export async function listDrafts(status = "pending"): Promise<DraftRow[]> {
  const rows = await query<DraftDb>(
    `SELECT draft_id, agent, kind, to_message_id, recipients, subject, body, rationale, status, created_at
       FROM app.drafts WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 25`,
    [TENANT, status],
  );
  return rows.map(mapDraft);
}

/** Persist a draft from draft_reply (still never sends — R3). */
export async function createDraft(messageId: string, intent?: string): Promise<DraftRow> {
  const env = await draftReply(messageId, intent);
  const rows = await query<DraftDb>(
    `INSERT INTO app.drafts (tenant_id, agent, kind, to_message_id, recipients, subject, body, rationale)
     VALUES ($1, 'drafting', 'reply', $2, $3, $4, $5, $6)
     RETURNING draft_id, agent, kind, to_message_id, recipients, subject, body, rationale, status, created_at`,
    [TENANT, env.toMessageId, env.recipients, env.subject, env.draft, env.rationale],
  );
  return mapDraft(rows[0]);
}

export async function setDraftStatus(draftId: string, status: "approved" | "discarded"): Promise<void> {
  await query(`UPDATE app.drafts SET status = $2, decided_at = NOW() WHERE draft_id = $1 AND tenant_id = $3`, [draftId, status, TENANT]);
}
