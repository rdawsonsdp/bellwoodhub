import Link from "next/link";
import type { CSSProperties } from "react";
import { Ms } from "./hub/ms";
import { C, FONT_BODY, FONT_HEAD } from "@/lib/design";

const MAX = 1120;

const CAPABILITIES = [
  {
    icon: "location_on",
    title: "Single view of a property or resident",
    body:
      "Pull up everything the village knows about an address or a person — every email, memo, permit, complaint and daily-report mention — on one timeline, across every department.",
  },
  {
    icon: "lightbulb",
    title: "History + next best action",
    body:
      "Not just what happened — what to do. Each answer summarizes the back-and-forth and ends with a concrete recommended next step, grounded in how you handled it before.",
  },
  {
    icon: "hub",
    title: "Cross-source resolution",
    body:
      "One Saturday-night bar incident lives in the police blotter, the fire/EMS run, the resident complaint, and Code Enforcement's reply. One question pulls all four into a single picture.",
  },
];

const STEPS = [
  {
    icon: "edit_note",
    title: "Ask in plain English",
    body: "No filters to learn. Type the question the way you'd ask a colleague.",
  },
  {
    icon: "travel_explore",
    title: "Search every stream",
    body:
      "Constituent mail, interdepartmental memos, police & fire daily reports, licensing — all one searchable knowledge base.",
  },
  {
    icon: "verified",
    title: "Grounded, cited answer",
    body:
      "A written answer with a citation on every claim — click through to the exact source message.",
  },
];

const DEMOS: { icon: string; q: string }[] = [
  {
    icon: "water_drop",
    q: "What's the full history on the drainage and flooding problem at 2218 Bohland Ave?",
  },
  {
    icon: "person",
    q: "What's our history with Gloria Bennett, and how should I handle her latest email?",
  },
  {
    icon: "house",
    q: "Where do things stand with Eleanor Meyer's basement flooding at 1733 Frederick Ave, and what should we do next?",
  },
  {
    icon: "hub",
    q: "Cross-reference the police and fire reports with resident complaints about the St. Charles Road bars — what's the full picture across every source?",
  },
  {
    icon: "pending_actions",
    q: "What's still open right now that I haven't resolved?",
  },
  {
    icon: "leaderboard",
    q: "Who has emailed me the most, and what about?",
  },
];

const STATS = [
  { n: "20,000", label: "synthetic municipal messages" },
  { n: "6", label: "source streams, one database" },
  { n: "100%", label: "answers cited to a source" },
  { n: "< 1¢", label: "per question" },
];

function hubLink(q: string): string {
  return `/hub?q=${encodeURIComponent(q)}`;
}

export function Landing() {
  return (
    <div style={{ fontFamily: FONT_BODY, color: C.ink, background: C.white }}>
      {/* ── Top bar ── */}
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
        <div style={{ ...row, maxWidth: MAX, minHeight: 64, gap: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={seal}>
              <Ms name="notifications" size={21} color={C.gold} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{ fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: C.gold, fontWeight: 600 }}>
                Village of Bellwood, IL
              </span>
              <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 17 }}>
                Knowledge AI Hub
              </span>
            </span>
          </span>
          <span style={{ flex: 1 }} />
          <Link href="/hub" style={ctaPrimary}>
            Launch the Hub
            <Ms name="arrow_forward" size={18} color="#fff" />
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        style={{
          background: `linear-gradient(160deg, ${C.navy} 0%, #09254e 55%, #07203f 100%)`,
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: MAX, margin: "0 auto", padding: "76px 24px 84px", textAlign: "center" }}>
          <span style={pill}>
            <Ms name="science" size={14} color="#f0c96a" />
            Synthetic demo data · no real personal information
          </span>
          <h1
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 600,
              fontSize: 52,
              lineHeight: 1.08,
              letterSpacing: "-.02em",
              margin: "22px auto 0",
              maxWidth: 860,
            }}
          >
            Your whole village hall,{" "}
            <span style={{ color: C.gold }}>answerable in one question.</span>
          </h1>
          <p
            style={{
              fontSize: 19,
              lineHeight: 1.55,
              color: "rgba(255,255,255,.82)",
              maxWidth: 680,
              margin: "20px auto 0",
            }}
          >
            The Knowledge AI Hub turns every municipal email and daily report —
            constituent requests, interdepartmental memos, police and fire reports,
            licensing — into one place you can simply ask. Plain-English questions,
            grounded answers, a citation on every claim.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 32 }}>
            <Link href="/hub" style={{ ...ctaPrimary, padding: "14px 24px", fontSize: 16 }}>
              Launch the Hub
              <Ms name="arrow_forward" size={19} color="#fff" />
            </Link>
            <a href="#try" style={ctaGhost}>
              Try a demo question
              <Ms name="south" size={18} color="#fff" />
            </a>
          </div>

          {/* stat band */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 18,
              maxWidth: 860,
              margin: "56px auto 0",
              paddingTop: 30,
              borderTop: "1px solid rgba(255,255,255,.14)",
            }}
          >
            {STATS.map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 30, color: C.gold }}>
                  {s.n}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,.72)", marginTop: 4 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section style={{ maxWidth: MAX, margin: "0 auto", padding: "72px 24px 8px" }}>
        <p style={eyebrow}>What it does</p>
        <h2 style={h2}>Three things every clerk wishes the inbox could do</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
            gap: 22,
            marginTop: 36,
          }}
        >
          {CAPABILITIES.map((c) => (
            <div key={c.title} style={card}>
              <span style={iconBadge}>
                <Ms name={c.icon} size={24} color={C.blue} />
              </span>
              <h3 style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 18.5, color: C.navy, margin: "16px 0 8px" }}>
                {c.title}
              </h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.muted, margin: 0 }}>{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Demo questions ── */}
      <section id="try" style={{ background: C.bg, marginTop: 64 }}>
        <div style={{ maxWidth: MAX, margin: "0 auto", padding: "72px 24px" }}>
          <p style={eyebrow}>See it in action</p>
          <h2 style={h2}>Try one of these — it runs live</h2>
          <p style={{ fontSize: 15.5, color: C.muted, maxWidth: 620, marginTop: 10 }}>
            Click any question to open the Hub and watch it answer against the live
            archive, with citations you can click through.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))",
              gap: 14,
              marginTop: 32,
            }}
          >
            {DEMOS.map((d) => (
              <Link key={d.q} href={hubLink(d.q)} style={demoCard}>
                <span style={{ ...iconBadge, width: 38, height: 38, borderRadius: 9, flex: "none" }}>
                  <Ms name={d.icon} size={20} color={C.blue} />
                </span>
                <span style={{ flex: 1, fontSize: 15, lineHeight: 1.4, color: C.ink, fontWeight: 500 }}>
                  {d.q}
                </span>
                <Ms name="arrow_forward" size={18} color={C.blue} style={{ flex: "none", marginTop: 2 }} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ maxWidth: MAX, margin: "0 auto", padding: "72px 24px" }}>
        <p style={eyebrow}>How it works</p>
        <h2 style={h2}>Ask. Retrieve. Cite.</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 22,
            marginTop: 36,
          }}
        >
          {STEPS.map((s, i) => (
            <div key={s.title} style={{ position: "relative", paddingTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={stepNum}>{i + 1}</span>
                <Ms name={s.icon} size={22} color={C.blue} />
              </div>
              <h3 style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 17.5, color: C.navy, margin: "0 0 6px" }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.muted, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ background: C.navy, color: "#fff" }}>
        <div style={{ maxWidth: MAX, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
          <h2 style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 32, letterSpacing: "-.02em", margin: 0 }}>
            Stop digging through four systems.
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,.8)", margin: "12px auto 0", maxWidth: 560 }}>
            Ask once. Get a grounded answer with the receipts.
          </p>
          <Link
            href="/hub"
            style={{ ...ctaPrimary, padding: "14px 26px", fontSize: 16, margin: "28px auto 0", display: "inline-flex" }}
          >
            Launch the Knowledge AI Hub
            <Ms name="arrow_forward" size={19} color="#fff" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: "#07203f", color: "rgba(255,255,255,.6)" }}>
        <div style={{ ...row, maxWidth: MAX, padding: "20px 24px", fontSize: 12.5, gap: 10 }}>
          <Ms name="notifications" size={15} color={C.gold} />
          <span>Village of Bellwood Knowledge AI Hub · prototype</span>
          <span style={{ flex: 1 }} />
          <span>Grounded over ~20,000 synthetic municipal messages · no real personal data</span>
        </div>
      </footer>
    </div>
  );
}

// ── shared styles ──
const row: CSSProperties = {
  margin: "0 auto",
  padding: "0 24px",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
};
const seal: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  border: `2px solid ${C.gold}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(227,169,44,.12)",
  flex: "none",
};
const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "6px 13px",
  borderRadius: 999,
  background: "rgba(227,169,44,.14)",
  border: "1px solid rgba(227,169,44,.45)",
  color: "#f0c96a",
  fontSize: 12.5,
  fontWeight: 600,
};
const ctaPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: C.blue,
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "10px 16px",
  fontFamily: FONT_BODY,
  fontWeight: 600,
  fontSize: 14.5,
  cursor: "pointer",
  textDecoration: "none",
};
const ctaGhost: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "rgba(255,255,255,.08)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,.25)",
  borderRadius: 10,
  padding: "14px 22px",
  fontFamily: FONT_BODY,
  fontWeight: 600,
  fontSize: 16,
  textDecoration: "none",
};
const eyebrow: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: C.blue,
  textTransform: "uppercase",
  letterSpacing: ".09em",
  margin: 0,
};
const h2: CSSProperties = {
  fontFamily: FONT_HEAD,
  fontWeight: 600,
  fontSize: 30,
  letterSpacing: "-.02em",
  color: C.navy,
  margin: "10px 0 0",
  maxWidth: 720,
  lineHeight: 1.2,
};
const card: CSSProperties = {
  background: C.white,
  border: `1px solid ${C.line}`,
  borderRadius: 16,
  padding: "26px 24px",
  boxShadow: "0 1px 2px rgba(11,46,99,.04)",
};
const demoCard: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  background: C.white,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  padding: "18px 18px",
  textDecoration: "none",
  boxShadow: "0 1px 2px rgba(11,46,99,.04)",
};
const iconBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 48,
  height: 48,
  borderRadius: 12,
  background: C.blueLightest,
  flex: "none",
};
const stepNum: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: "50%",
  background: C.navy,
  color: "#fff",
  fontFamily: FONT_HEAD,
  fontWeight: 600,
  fontSize: 15,
  flex: "none",
};
