import { NextRequest, NextResponse } from "next/server";
import { getEmailByMessageId } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  try {
    const mid = req.nextUrl.searchParams.get("mid");
    if (!mid) {
      return NextResponse.json({ error: "Provide mid (message id)." }, { status: 400 });
    }
    const email = await getEmailByMessageId(mid);
    if (!email) {
      return NextResponse.json({ error: "Email not found." }, { status: 404 });
    }
    return NextResponse.json(email);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/email]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
