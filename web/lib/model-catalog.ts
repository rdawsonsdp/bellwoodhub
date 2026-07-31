/*
 * model-catalog.ts — the model list, discovered LIVE rather than hardcoded.
 *
 * "We know that these models will change over time" (RD 2026-07-31). A static
 * dropdown would need a code change and a deploy every time Anthropic ships a
 * model — and this repo already proved that rots: the Admin console still
 * offered Sonnet 4.6 and Opus 4.8 months after they were superseded, and priced
 * Opus at $15/$75, which was never Opus 5's rate.
 *
 * So the catalog comes from the Models API (client.models.list()), which returns
 * the ids, display names and capabilities that are actually available to this
 * API key today. A new model shows up in the picker on its own.
 *
 * Two things the API does NOT return, and how they're handled:
 *   - PRICING. Kept in a small table below, keyed by id prefix, and clearly
 *     marked estimated when a model isn't in it. Never invent a number.
 *   - WHICH MODEL IS "BEST". Ordering is by capability tier inferred from the
 *     family name, so a future "opus-6" sorts above sonnet without a code edit.
 */
import { anthropic } from "./agents/claude";
import { MODEL_TIERS, type ModelTier } from "./agents/constants";

export interface CatalogModel {
  id: string;
  label: string;
  /** opus | sonnet | haiku | other — drives ordering and the default pick */
  family: string;
  inPer1M: number | null;
  outPer1M: number | null;
  /** true when pricing is not known for this id (shown as "—", never guessed) */
  pricingUnknown: boolean;
  maxInputTokens?: number;
}

/** USD per 1M tokens, verified 2026-07-31. Keyed by id PREFIX so a dated
 *  snapshot (claude-opus-5-2026xxxx) inherits its family's rate. */
const PRICES: { prefix: string; inPer1M: number; outPer1M: number }[] = [
  { prefix: "claude-fable-5", inPer1M: 10, outPer1M: 50 },
  { prefix: "claude-mythos-5", inPer1M: 10, outPer1M: 50 },
  { prefix: "claude-opus-5", inPer1M: 5, outPer1M: 25 },
  { prefix: "claude-opus-4", inPer1M: 5, outPer1M: 25 },
  { prefix: "claude-sonnet-5", inPer1M: 3, outPer1M: 15 },
  { prefix: "claude-sonnet-4", inPer1M: 3, outPer1M: 15 },
  { prefix: "claude-haiku-4", inPer1M: 1, outPer1M: 5 },
];

const FAMILY_RANK: Record<string, number> = { fable: 0, mythos: 0, opus: 1, sonnet: 2, haiku: 3, other: 4 };

function familyOf(id: string): string {
  for (const f of ["fable", "mythos", "opus", "sonnet", "haiku"]) if (id.includes(f)) return f;
  return "other";
}

function priceOf(id: string) {
  const hit = PRICES.find((p) => id.startsWith(p.prefix));
  return hit ? { inPer1M: hit.inPer1M, outPer1M: hit.outPer1M, pricingUnknown: false }
             : { inPer1M: null, outPer1M: null, pricingUnknown: true };
}

/** Static fallback, so the picker still renders if the Models API is
 *  unreachable — an outage must never leave the user with an empty dropdown. */
function fallback(): CatalogModel[] {
  return MODEL_TIERS.map((t: ModelTier) => ({
    id: t.reasoning, label: t.label, family: familyOf(t.reasoning),
    inPer1M: t.inPer1M, outPer1M: t.outPer1M, pricingUnknown: false,
  }));
}

let cache: { at: number; models: CatalogModel[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // an hour — new models don't ship by the minute

export async function listModels(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;
  try {
    const out: CatalogModel[] = [];
    // The list auto-paginates; only Claude text models are routable here.
    for await (const m of anthropic().models.list({ limit: 100 })) {
      const id = (m as { id: string }).id;
      if (!id?.startsWith("claude-")) continue;
      const label = (m as { display_name?: string }).display_name ?? id;
      out.push({
        id, label, family: familyOf(id), ...priceOf(id),
        maxInputTokens: (m as { max_input_tokens?: number }).max_input_tokens,
      });
    }
    if (!out.length) throw new Error("empty catalog");
    out.sort((a, b) =>
      (FAMILY_RANK[a.family] ?? 9) - (FAMILY_RANK[b.family] ?? 9) || b.id.localeCompare(a.id));
    cache = { at: Date.now(), models: out };
    return out;
  } catch {
    return fallback();
  }
}
