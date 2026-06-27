import { NextRequest, NextResponse } from "next/server";
import { ask, type SearchOpts } from "@/lib/backend";
import { DEMO, demoAsk } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // embedding + retrieval + LLM synthesis

function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = clean(body.question);
    if (!question) {
      return NextResponse.json({ error: "Missing question." }, { status: 400 });
    }
    if (DEMO) {
      const k = typeof body.k === "number" && Number.isFinite(body.k) ? body.k : 8;
      return NextResponse.json(await demoAsk(question, k));
    }
    const filters: SearchOpts = {
      person: clean(body.person),
      address: clean(body.address),
      since: clean(body.since),
      until: clean(body.until),
      topic: clean(body.topic),
      k: typeof body.k === "number" && Number.isFinite(body.k) ? body.k : 8,
      noAuto: body.noAuto === true,
    };
    const result = await ask(question, filters);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/ask]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
