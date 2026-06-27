import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/retrieval";
import { DEMO, demoDashboard } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    if (DEMO) return NextResponse.json(demoDashboard());
    const result = await getDashboard();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
