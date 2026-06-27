import Link from "next/link";
import { Ms } from "@/components/hub/ms";
import {
  C,
  FONT_BODY,
  FONT_HEAD,
  streamMeta,
  topicChipStyle,
  topicMeta,
} from "@/lib/design";
import { fmtDate } from "@/lib/utils";
import { getEmailByMessageId } from "@/lib/retrieval";
import { DEMO, demoEmail } from "@/lib/demo";

export const dynamic = "force-dynamic";

// Full source document: prefer the DB body, fall back to the seed snippet so the
// drill-in always resolves even in keyless demo mode.
async function loadEmail(mid: string) {
  if (process.env.DATABASE_URL) {
    try {
      const full = await getEmailByMessageId(mid);
      if (full) return full;
    } catch {
      /* fall back */
    }
  }
  return DEMO ? demoEmail(mid) : null;
}

export default async function EmailPage({
  searchParams,
}: {
  searchParams: { mid?: string };
}) {
  const mid = searchParams.mid;
  const email = mid ? await loadEmail(mid) : null;
  const inbound = email?.direction === "inbound";

  return (
    <div style={{ minHeight: "100vh", fontFamily: FONT_BODY, color: C.ink, background: C.bg }}>
      {/* top bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: C.navy,
          color: "#fff",
          borderBottom: `3px solid ${C.gold}`,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "0 24px",
            minHeight: 60,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Link
            href="/hub"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14 }}
          >
            <Ms name="arrow_back" size={18} color="#fff" />
            Back to the Hub
          </Link>
          <span style={{ flex: 1 }} />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 999,
              background: "rgba(227,169,44,.16)",
              border: "1px solid rgba(227,169,44,.5)",
              color: "#f0c96a",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <Ms name="science" size={14} color="#f0c96a" />
            Synthetic demo data
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 80px" }}>
        {!email ? (
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "40px 28px", textAlign: "center" }}>
            <Ms name="mail_off" size={28} color={C.muted2} />
            <p style={{ fontSize: 16, color: C.muted, margin: "12px 0 0" }}>
              That email document could not be found.
            </p>
            <Link href="/hub" style={{ color: C.blue, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
              ← Back to the Hub
            </Link>
          </div>
        ) : (
          <article style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: `3px solid ${C.navy}`, borderRadius: 16, padding: "30px 34px", boxShadow: "0 1px 2px rgba(11,46,99,.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "#fff",
                  background: streamMeta(email.stream).color,
                }}
              >
                <Ms name={streamMeta(email.stream).icon} size={14} color="#fff" />
                {streamMeta(email.stream).label}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: inbound ? C.blue : C.greenDark }}>
                <Ms name={inbound ? "south_west" : "north_east"} size={14} color={inbound ? C.blue : C.greenDark} />
                {inbound ? "Inbound" : "Outbound"}
              </span>
              {email.topic ? <span style={topicChipStyle(email.topic)}>{topicMeta(email.topic).label}</span> : null}
            </div>

            <h1 style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 26, letterSpacing: "-.01em", color: C.navy, margin: "0 0 18px", lineHeight: 1.25 }}>
              {email.subject || "(no subject)"}
            </h1>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "6px 14px",
                fontSize: 13.5,
                color: C.ink2,
                paddingBottom: 18,
                marginBottom: 20,
                borderBottom: `1px solid ${C.line}`,
              }}
            >
              <span style={metaKey}>From</span>
              <span>
                {email.fromName || "Unknown"}
                {email.fromEmail ? ` <${email.fromEmail}>` : ""}
              </span>
              <span style={metaKey}>To</span>
              <span>{email.toEmail || "—"}</span>
              {email.cc ? (
                <>
                  <span style={metaKey}>Cc</span>
                  <span>{email.cc}</span>
                </>
              ) : null}
              <span style={metaKey}>Date</span>
              <span>{fmtDate(email.date)}</span>
            </div>

            <div
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 15.5,
                lineHeight: 1.7,
                color: C.ink,
              }}
            >
              {email.bodyClean || "(no body content)"}
            </div>

            {email.bodyRaw && email.bodyRaw.trim() !== email.bodyClean.trim() ? (
              <details style={{ marginTop: 24 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.blue }}>
                  Show original (with signature, disclaimer &amp; quoted history)
                </summary>
                <pre
                  className="vkb-scroll"
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: C.ink2,
                    margin: "12px 0 0",
                    background: "#f8fafc",
                    border: `1px solid ${C.line}`,
                    borderRadius: 10,
                    padding: "14px 16px",
                  }}
                >
                  {email.bodyRaw}
                </pre>
              </details>
            ) : null}
          </article>
        )}
      </main>
    </div>
  );
}

const metaKey = {
  fontWeight: 700,
  color: C.muted,
  textTransform: "uppercase" as const,
  letterSpacing: ".05em",
  fontSize: 11,
  paddingTop: 2,
};
