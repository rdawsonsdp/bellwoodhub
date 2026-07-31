import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { listModels } from "@/lib/model-catalog";
import { getModelId, setModelId, DEFAULT_MODEL_ID } from "@/lib/model-preference";
import { MODEL_TIERS } from "@/lib/agents/constants";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The model picker behind the Ask box. GET returns the LIVE catalog (Models
// API) plus the current selection; POST changes it. The selection is stored
// server-side so the cron agents run on the same model the user chose.
export async function GET() {
  if (DEMO) {
    return NextResponse.json({
      selected: DEFAULT_MODEL_ID,
      models: MODEL_TIERS.map((t) => ({ id: t.reasoning, label: t.label, family: t.id.split("-")[0], inPer1M: t.inPer1M, outPer1M: t.outPer1M, pricingUnknown: false })),
    });
  }
  const [models, selected] = await Promise.all([listModels(), getModelId()]);
  return NextResponse.json({ selected, models });
}

export async function POST(req: NextRequest) {
  try {
    if (DEMO) return NextResponse.json({ ok: true, mode: "demo" });
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // Validate against the LIVE catalog rather than a hardcoded list, and
    // REJECT an unknown id instead of quietly substituting the default — that
    // substitution is exactly what made the picker show Sonnet while the server
    // kept running Opus (RD 2026-07-31).
    const catalog = await listModels();
    if (!catalog.some((m) => m.id === id)) {
      return NextResponse.json({ error: `Unknown model: ${id}` }, { status: 400 });
    }
    const saved = await setModelId(id);
    await logAudit({ actor: null, action: "model.set", meta: { model: saved }, req });
    return NextResponse.json({ ok: true, selected: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
