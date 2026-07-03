import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { MAILBOXES, type Mailbox, type Provider } from "@/lib/mailboxes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Connected mailboxes (the "source system" dimension) for the Emails screens.
// Demo: the static lib/mailboxes registry, shape unchanged. Live: derived from
// pipeline.connector_accounts — one mailbox per distinct mailbox_id (any
// status). An empty table returns an honest [] (live surfaces are real or
// honestly empty, never fictional); the switchers render a quiet empty state.
const MAILBOX_META: Record<string, { label: string; color: string }> = {
  gov: { label: "Government", color: "#67adff" },
  biz: { label: "Private", color: "#9d8bff" },
};

export async function GET() {
  try {
    if (DEMO) return NextResponse.json(MAILBOXES);
    const { query } = await import("@/lib/db");
    const rows = await query<{ mailbox_id: string; provider: Provider; address: string }>(
      `SELECT DISTINCT ON (mailbox_id) mailbox_id, provider, address
         FROM pipeline.connector_accounts
        ORDER BY mailbox_id, created_at`,
    );
    const mailboxes: Mailbox[] = rows.map((r) => ({
      id: r.mailbox_id,
      label: MAILBOX_META[r.mailbox_id]?.label ?? r.mailbox_id,
      short: MAILBOX_META[r.mailbox_id]?.label ?? r.mailbox_id,
      provider: r.provider,
      address: r.address,
      color: MAILBOX_META[r.mailbox_id]?.color ?? "#67adff",
      isPrivate: r.mailbox_id === "biz",
      foiaScope: r.mailbox_id === "gov",
      isDefault: r.mailbox_id === "gov",
    }));
    return NextResponse.json(mailboxes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
