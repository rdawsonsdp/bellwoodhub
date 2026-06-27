import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Voice search: accept a recorded audio blob (multipart 'audio') and return the
// transcript via OpenAI speech-to-text. The Ask omnibox fills the query with it.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Provide an 'audio' file." }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Transcription needs OPENAI_API_KEY." }, { status: 503 });
    }
    const r = await openai().audio.transcriptions.create({
      file,
      model: process.env.TRANSCRIBE_MODEL || "whisper-1",
      language: "en",
    });
    return NextResponse.json({ text: r.text.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
