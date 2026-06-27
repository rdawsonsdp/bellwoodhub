import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Phrases Whisper invents when fed silence or noise (training-data artifacts).
// If the whole transcript is just one of these, treat it as "no speech".
const HALLUCINATIONS = [
  "thank you", "thank you.", "thanks", "thanks.", "thank you for watching",
  "thank you for watching.", "thanks for watching", "thanks for watching.",
  "thank you for watching!", "thanks for watching!", "please subscribe",
  "please subscribe.", "subscribe", "you", "you.", "bye", "bye.", "bye bye",
  "see you next time", "see you next time.", "i'll see you next time.",
  "♪", "[music]", "(music)", "[silence]", "subtitles by the amara.org community",
  "thank you very much", "thank you very much.", "okay", "okay.", "so",
];
function isWhisperHallucination(text: string): boolean {
  const norm = text.toLowerCase().replace(/[\s’']+/g, " ").trim();
  if (norm.length <= 2) return true; // "you", ".", single char
  return HALLUCINATIONS.includes(norm);
}

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
    // Reject empty/near-silent clips before spending — silence is what makes
    // Whisper hallucinate ("thank you for watching", "please subscribe", …).
    if (file.size < 1600) {
      return NextResponse.json({ text: "", empty: true });
    }
    const r = await openai().audio.transcriptions.create({
      file,
      model: process.env.TRANSCRIBE_MODEL || "whisper-1",
      language: "en",
      temperature: 0, // deterministic — reduces invented text
    });
    const text = (r.text || "").trim();
    if (!text || isWhisperHallucination(text)) {
      return NextResponse.json({ text: "", empty: true });
    }
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
