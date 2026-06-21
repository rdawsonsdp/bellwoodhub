import { NextRequest, NextResponse } from "next/server";
import { getEntity } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type");
    const value = sp.get("value");
    if ((type !== "person" && type !== "address") || !value) {
      return NextResponse.json(
        { error: "Provide type=person|address and value." },
        { status: 400 },
      );
    }
    const result = await getEntity(type, value);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/entity]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
