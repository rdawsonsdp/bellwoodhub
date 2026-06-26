import { NextRequest, NextResponse } from "next/server";
import { memoryList, memoryDetail } from "@/lib/screens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const value = req.nextUrl.searchParams.get("value");
    if (value) {
      const detail = await memoryDetail(value);
      return detail ? NextResponse.json(detail) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ entities: await memoryList() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
