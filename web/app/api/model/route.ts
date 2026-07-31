import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { listModels } from "@/lib/model-catalog";
import { getModelTierId, setModelTierId } from "@/lib/model-preference";
import { DEFAULT_TIER, MODEL_TIERS } from "@/lib/agents/constants";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The model picker behind the Ask box. GET returns the LIVE catalog (Models
// API) plus the current selection; POST changes it. The selection is stored
// server-side so the cron agents run on the same model the user chose.
export async function GET() {
  if (DEMO) {
    return NextResponse.json({
      selected: DEFAULT_TIER,
      models: MODEL_TIERS.map((t) => ({ id: t.reasoning, label: t.label, family: t.id.split("-")[0], inPer1M: t.inPer1M, outPer1M: t.outPer1M, pricingUnknown: false })),
    });
  }
  const [models, selected] = await Promise.all([listModels(), getModelTierId()]);
  return NextResponse.json({ selected, models });
}

export async function POST(req: NextRequest) {
  try {
    if (DEMO) return NextResponse.json({ ok: true, mode: "demo" });
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const tier = await setModelTierId(id);
    await logAudit({ actor: null, action: "model.tier.set", meta: { id: tier.id, model: tier.reasoning }, req });
    return NextResponse.json({ ok: true, selected: tier.id, model: tier.reasoning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
