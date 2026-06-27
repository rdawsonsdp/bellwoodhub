import { NextRequest, NextResponse } from "next/server";
import { sourcesOverview, resolveReview } from "@/lib/screens";
import { DEMO, demoSources } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    if (DEMO) return NextResponse.json(demoSources());
    return NextResponse.json(await sourcesOverview());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Review-queue action: merge (assert alias on existing identity) or reject. Both reversible (R2).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const reviewId = typeof body.reviewId === "string" ? body.reviewId : "";
    const action = body.action === "merge" || body.action === "reject" ? body.action : null;
    if (!reviewId || !action) {
      return NextResponse.json({ error: "reviewId and action (merge|reject) required" }, { status: 400 });
    }
    if (DEMO) return NextResponse.json(demoSources()); // review actions are no-ops in the demo
    await resolveReview(reviewId, action);
    return NextResponse.json(await sourcesOverview());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
