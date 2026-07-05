import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent enable switches (FEAT-19 first slice — RD 2026-07-03: agents are
// managed in the app). GET returns the disabled set; POST flips one agent.
// Absent row = enabled, so the map only carries the exceptions.
//
// FEAT-20 (RD 2026-07-05: "it doesn't look accurately updated"): on live, GET
// also returns the FACTS behind the email-agent cards (real account, lane,
// send capability from connector state — never persona fixtures) and real
// recent activity assembled from the records the system actually keeps
// (connector syncs, app.drafts, canonical.agent_runs). Each lookup fails
// soft so the enable switches survive any one table being absent.

const fmtCT = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

export async function GET() {
  try {
    if (DEMO) return NextResponse.json({ configs: {} });
    const { query } = await import("@/lib/db");
    const rows = await query<{ agent_key: string; enabled: boolean }>(
      `SELECT agent_key, enabled FROM app.agent_configs`,
    );
    const configs: Record<string, boolean> = {};
    for (const r of rows) configs[r.agent_key] = r.enabled;

    // ── email-agent facts from connector reality ──
    type AccountRow = {
      provider: string; address: string; mailbox_id: string; status: string;
      last_synced_at: string | null; cursor: string | null;
    };
    const accounts = await query<AccountRow>(
      `SELECT provider, address, mailbox_id, status, last_synced_at::text, cursor
         FROM pipeline.connector_accounts ORDER BY created_at`,
    ).catch(() => [] as AccountRow[]);
    type CountRow = { account: string | null; n: string };
    const counts = await query<CountRow>(
      `SELECT provenance->>'_account' AS account, count(*) AS n
         FROM canonical.messages GROUP BY 1`,
    ).catch(() => [] as CountRow[]);
    const email: Record<string, unknown> = {};
    const activity: Record<string, string[]> = {};
    // ING-4 reconciliation: how much of the mirror is embedded for search
    const { embedCounts } = await import("@/lib/embed-mail");
    const idx = await embedCounts().catch(() => null);
    for (const a of accounts) {
      const key = a.provider === "gmail" ? "email-gmail" : "email-outlook";
      const messages = Number(counts.find((c) => c.account === a.address)?.n ?? 0);
      const midWalk = !!a.cursor?.startsWith("bf:");
      email[key] = {
        address: a.address, provider: a.provider, walled: a.mailbox_id === "biz",
        status: a.status, midWalk, messages,
        sendEnabled: a.provider === "gmail" && process.env.SEND_ENABLED === "1",
      };
      activity[key] = [
        `${messages.toLocaleString()} messages mirrored into the record${midWalk ? " — initial mailbox walk still in progress" : ""}`,
        ...(idx && idx.messages > 0 ? [`Search index: ${idx.indexed.toLocaleString()} of ${idx.messages.toLocaleString()} messages embedded`] : []),
        ...(a.last_synced_at ? [`Last sync · ${fmtCT(a.last_synced_at)}`] : []),
      ];
    }

    // ── real transmissions → the Gmail seat; drafts → the Drafting agent ──
    type DraftRow = { subject: string | null; recipients: string | null; status: string; sent_at: string | null; created_at: string };
    const drafts = await query<DraftRow>(
      `SELECT subject, recipients, status, sent_at::text, created_at::text
         FROM app.drafts ORDER BY created_at DESC LIMIT 40`,
    ).catch(() => [] as DraftRow[]);
    const sent = drafts.filter((d) => d.sent_at).slice(0, 3);
    if (sent.length && activity["email-gmail"]) {
      activity["email-gmail"].push(
        ...sent.map((d) => `Sent (human-approved): ${d.subject ?? "reply"} → ${d.recipients ?? "—"} · ${fmtCT(d.sent_at!)}`),
      );
    }
    if (drafts.length) {
      const word = (d: DraftRow) =>
        d.sent_at ? "approved & sent" : d.status === "approved" ? "approved" : d.status === "discarded" ? "discarded" : "waiting on you";
      activity["drafting"] = drafts.slice(0, 4).map((d) => `Drafted: ${d.subject ?? "reply"} (${word(d)}) · ${fmtCT(d.created_at)}`);
    }

    // ── latest run per agent (sentinel + any key that matches the roster) ──
    const { liveLatestRuns } = await import("@/lib/live-inbox");
    const runs = await liveLatestRuns().catch(() => []);
    for (const r of runs) {
      activity[r.agentKey] = [`${r.output.headline} · ${fmtCT(r.ranAt)}`, ...(activity[r.agentKey] ?? [])];
    }

    return NextResponse.json({ configs, email, activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = process.env.AUTH_ENABLED === "1" ? await auth() : null;
    if (process.env.AUTH_ENABLED === "1" && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (DEMO) {
      return NextResponse.json({ ok: true, mode: "demo", note: "Demo mode — agent switches are display-only." });
    }
    const { agentKey, enabled } = (await req.json()) as { agentKey?: string; enabled?: boolean };
    if (!agentKey || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "agentKey (string) and enabled (boolean) required" }, { status: 400 });
    }
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO app.agent_configs (agent_key, enabled, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (agent_key) DO UPDATE SET
         enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [agentKey, enabled, session?.user?.email ?? null],
    );
    await logAudit({
      actor: session?.user?.email ?? null,
      action: "agent.config.toggle",
      objectRef: agentKey,
      meta: { agentKey, enabled },
      req,
    });
    return NextResponse.json({ ok: true, agentKey, enabled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/agents/config]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
