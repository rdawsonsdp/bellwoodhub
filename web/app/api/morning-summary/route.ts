import { NextResponse } from "next/server";
import { DEMO, demoMorningSummary } from "@/lib/demo";
import { COS_PERSONA_DEFAULT, type CosPersona } from "@/lib/morning";

export const runtime = "nodejs";

/*
 * POST /api/morning-summary — the Chief of Staff's morning briefing for the Today
 * screen. Body: { persona } (mayor name / greeting / tone / instructions), read
 * client-side from the Admin config and passed through so the voice is
 * configurable. The summary folds every other agent's output + the inbox +
 * today's calendar into one digest.
 *
 * Demo is the default, keyless path; the live DB-backed brief is a TODO that
 * returns the same MorningSummary shape, so both branches always render.
 */
export async function POST(req: Request) {
  let persona: CosPersona = COS_PERSONA_DEFAULT;
  try {
    const body = await req.json();
    persona = { ...COS_PERSONA_DEFAULT, ...(body?.persona ?? {}) };
  } catch { /* defaults */ }

  if (DEMO) return NextResponse.json(await demoMorningSummary(persona));
  // Live path not yet wired — serve the fixture-derived briefing so Today renders.
  return NextResponse.json(await demoMorningSummary(persona));
}
