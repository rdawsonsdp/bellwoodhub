/*
 * queue.ts — getQueue(): the ACT provider. The union of every domain agent's
 * actItems and the (existing) pending drafts store, deduped by threadId,
 * ordered red → yellow → recency. One list; clearing it is the Mayor's job,
 * and it should take under five minutes.
 *
 * Where both sources describe the same thread, the stored draft wins the
 * identity (its draftId keys the /api/approvals actions and carries the
 * Mayor's saved edits); the agent run supplies urgency, citations, and
 * provenance. Walled agents' drafts never enter the government Queue.
 *
 * Item STATE (pending/revising/approved/skipped) is a client concern in DEMO —
 * lib/queue-state.ts persists it in localStorage so the queue survives
 * refresh/navigation (invariant 7). Live mode extends the approvals tables.
 */
import { DOMAIN_AGENTS, type Urgency } from "./domain-agents";
import { URGENCY_RANK } from "./agent-run";
import { DEMO, DEMO_NOW, demoDrafts, demoMessageMeta, type MessageMeta } from "./demo";
import { DEMO_AGENT_RUNS } from "./demo/data/domain-agents";

export interface QueueCitation {
  messageId: string;
  label: string;
}

export interface QueueItem {
  id: string; // stable: the draftId when the approvals store backs it
  agentKey: string;
  agentName: string;
  agentColor: string; // identity hue (see domain-agents.ts)
  urgency: Urgency; // from the drafting agent's latest run
  threadId: string;
  to: string; // recipient (store) or the thread's inbound sender (fallback)
  subject: string;
  fullBody: string; // NEVER truncated on an approve surface (invariant 6)
  rationale: string;
  citations: QueueCitation[];
  draftId?: string; // present → approve/discard wire to /api/approvals
  date: string; // newest inbound date in the thread (recency rank)
}

export function getQueue(): { items: QueueItem[]; generatedAt: string } {
  if (!DEMO) {
    throw new Error("Live Queue extends the approvals tables — post-Phase-3 work.");
  }
  const agents = new Map(DOMAIN_AGENTS.filter((a) => a.active && !a.walled).map((a) => [a.key, a]));
  const runs = DEMO_AGENT_RUNS.filter((r) => agents.has(r.agentKey));
  const drafts = demoDrafts("pending");

  // one metadata pass over everything cited or replied-to
  const ids = new Set<string>();
  runs.forEach((r) => r.output.actItems.forEach((a) => a.citations.forEach((id) => ids.add(id))));
  drafts.forEach((d) => { if (d.toMessageId) ids.add(d.toMessageId); });
  const meta = demoMessageMeta([...ids]);
  const chipLabel = (id: string) =>
    meta.get(id)?.fromName ?? (id.startsWith("doc-") ? "Document" : id.slice(0, 12));
  const newestInbound = (msgIds: string[]): MessageMeta | undefined => {
    const ms = msgIds
      .map((id) => meta.get(id))
      .filter((m): m is MessageMeta => !!m)
      .sort((a, b) => b.date.localeCompare(a.date));
    return ms.find((m) => m.direction === "inbound") ?? ms[0];
  };

  const byThread = new Map<string, QueueItem>();
  for (const r of runs) {
    const agent = agents.get(r.agentKey)!;
    for (const a of r.output.actItems) {
      const nb = newestInbound(a.citations);
      byThread.set(a.threadId, {
        id: `${agent.key}:${a.threadId}`,
        agentKey: agent.key,
        agentName: agent.name,
        agentColor: agent.color,
        urgency: r.output.urgency,
        threadId: a.threadId,
        to: nb?.fromName ?? "—",
        subject: a.draftSubject,
        fullBody: a.draftBody,
        rationale: a.rationale,
        citations: a.citations.map((id) => ({ messageId: id, label: chipLabel(id) })),
        date: nb?.date ?? DEMO_NOW,
      });
    }
  }

  // overlay the stored pending drafts: same thread → merge (gain the draftId,
  // the real recipient address, and any saved Mayor edits); unknown thread →
  // a legacy drafting-store item at yellow
  for (const d of drafts) {
    const toMid = d.toMessageId ?? "";
    const threadId = (toMid && meta.get(toMid)?.threadId) || toMid || d.draftId;
    const hit = byThread.get(threadId);
    if (hit) {
      hit.id = d.draftId;
      hit.draftId = d.draftId;
      hit.to = d.recipients ?? hit.to;
      hit.subject = d.subject ?? hit.subject;
      hit.fullBody = d.body; // the store carries the Mayor's edits
    } else {
      const nb = toMid ? newestInbound([toMid]) : undefined;
      byThread.set(threadId, {
        id: d.draftId,
        draftId: d.draftId,
        agentKey: d.agent,
        agentName: "Drafting Agent",
        agentColor: "#93a4bd", // legacy store item — no cabinet seat yet
        urgency: "yellow",
        threadId,
        to: d.recipients ?? nb?.fromName ?? "—",
        subject: d.subject ?? "Draft reply",
        fullBody: d.body,
        rationale: d.rationale ?? "",
        citations: toMid ? [{ messageId: toMid, label: chipLabel(toMid) }] : [],
        date: nb?.date ?? d.createdAt,
      });
    }
  }

  const items = [...byThread.values()].sort(
    (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.date.localeCompare(a.date),
  );
  return { items, generatedAt: DEMO_NOW };
}
