"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Ms } from "./hub/ms";
import { AnswerBody, Shim, SourceCard, StreamPill, TopicChip } from "./hub/pieces";
import {
  C,
  CHIPS,
  FONT_BODY,
  FONT_HEAD,
  TOPIC_OPTIONS,
  streamMeta,
  topicChipStyle,
  topicMeta,
} from "@/lib/design";
import { isKnownPerson } from "@/lib/entities";
import { fmtDate, fmtDateShort, fmtRange } from "@/lib/utils";
import type {
  AskResponse,
  DashboardResponse,
  EntityResponse,
  Source,
} from "@/lib/types";

type Screen = "ask" | "entity" | "dashboard";
type Layout = "stacked" | "split" | "focus";
interface Filters {
  person: string;
  address: string;
  since: string;
  until: string;
  topic: string;
}
interface EntityRef {
  type: "person" | "address";
  value: string;
}

const MAX = 1200;

export function HubApp({ initialQuestion }: { initialQuestion?: string }) {
  const [screen, setScreen] = useState<Screen>("ask");
  const [layout, setLayout] = useState<Layout>("stacked");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({
    person: "",
    address: "",
    since: "",
    until: "",
    topic: "",
  });
  const [refineOpen, setRefineOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [activeText, setActiveText] = useState("");
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [autoDismissed, setAutoDismissed] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const [entityRef, setEntityRef] = useState<EntityRef | null>(null);
  const [entityData, setEntityData] = useState<EntityResponse | null>(null);
  const [entityLoading, setEntityLoading] = useState(false);
  const [entityError, setEntityError] = useState<string | null>(null);
  const [entitySummary, setEntitySummary] = useState<AskResponse | null>(null);
  const [entitySummaryLoading, setEntitySummaryLoading] = useState(false);
  const [entitySummaryOpen, setEntitySummaryOpen] = useState(false);
  const [lookupValue, setLookupValue] = useState("");
  const [lookupType, setLookupType] = useState<"person" | "address">("person");

  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState<string | null>(null);

  const hasActive = !!result || loading || !!askError;

  // ── actions ───────────────────────────────────────────────────────────────
  async function runAsk(text: string, opts?: { noAuto?: boolean }) {
    const q = text.trim();
    if (!q) return;
    setScreen("ask");
    setLoading(true);
    setAskError(null);
    setActiveCite(null);
    setAutoDismissed(false);
    setActiveText(q);
    setResult(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, ...filters, noAuto: opts?.noAuto ?? false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setResult(data as AskResponse);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function cite(n: number) {
    setActiveCite(n);
    setTimeout(() => {
      const el = document.getElementById("src-" + n);
      if (el) {
        const r = el.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + r.top - 150, behavior: "smooth" });
      }
    }, 30);
  }

  async function openEntity(ref: EntityRef) {
    setScreen("entity");
    setEntityRef(ref);
    setEntityData(null);
    setEntityError(null);
    setEntitySummary(null);
    setEntitySummaryOpen(false);
    setEntityLoading(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const res = await fetch(
        `/api/entity?type=${ref.type}&value=${encodeURIComponent(ref.value)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setEntityData(data as EntityResponse);
    } catch (e) {
      setEntityError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setEntityLoading(false);
    }
  }

  async function summarizeEntity() {
    if (!entityRef) return;
    if (entitySummaryOpen) {
      setEntitySummaryOpen(false);
      return;
    }
    setEntitySummaryOpen(true);
    if (entitySummary || entitySummaryLoading) return;
    setEntitySummaryLoading(true);
    try {
      const label = entityRef.value;
      const q =
        entityRef.type === "address"
          ? `Summarize the full history at ${label} and recommend the next best action.`
          : `Summarize our full history with ${label} and recommend the next best action.`;
      const body: Record<string, unknown> = { question: q, noAuto: true };
      if (entityRef.type === "person") body.person = label;
      else body.address = label;
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) setEntitySummary(data as AskResponse);
    } finally {
      setEntitySummaryLoading(false);
    }
  }

  async function goDash() {
    setScreen("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (dash || dashLoading) return;
    setDashLoading(true);
    setDashError(null);
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setDash(data as DashboardResponse);
    } catch (e) {
      setDashError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDashLoading(false);
    }
  }

  function sourceEntity(s: Source): (() => void) | undefined {
    if (s.fromName && isKnownPerson(s.fromName)) {
      const name = s.fromName;
      return () => openEntity({ type: "person", value: name });
    }
    return undefined;
  }

  // ── style helpers ──────────────────────────────────────────────────────────
  const navStyle = (on: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    borderRadius: 9,
    border: 0,
    cursor: "pointer",
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: 600,
    background: on ? "rgba(255,255,255,.16)" : "transparent",
    color: on ? "#fff" : "rgba(255,255,255,.72)",
  });
  const segStyle = (on: boolean): CSSProperties => ({
    padding: "6px 13px",
    border: 0,
    borderRadius: 7,
    cursor: "pointer",
    fontFamily: FONT_BODY,
    fontSize: 12.5,
    fontWeight: 600,
    background: on ? "#fff" : "transparent",
    color: on ? C.navy : C.muted,
    boxShadow: on ? "0 1px 2px rgba(0,0,0,.1)" : undefined,
  });

  // Deep-link support: /hub?q=... runs the question on first load.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (initialQuestion && initialQuestion.trim()) {
      setQuery(initialQuestion);
      runAsk(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: "100vh", fontFamily: FONT_BODY, color: C.ink, background: C.bg }}>
      {/* ===== HEADER ===== */}
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
            maxWidth: MAX,
            margin: "0 auto",
            padding: "0 24px",
            minHeight: 66,
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setScreen("ask")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              background: "none",
              border: 0,
              padding: "9px 0",
              cursor: "pointer",
              color: "#fff",
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: `2px solid ${C.gold}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(227,169,44,.12)",
                flex: "none",
              }}
            >
              <Ms name="notifications" size={23} color={C.gold} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
              <span style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C.gold, fontWeight: 600 }}>
                Village of Bellwood, IL
              </span>
              <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 18, letterSpacing: "-.01em" }}>
                Knowledge AI Hub
              </span>
            </span>
          </button>

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

          <span style={{ flex: 1 }} />

          <nav style={{ display: "flex", alignItems: "stretch", gap: 4 }}>
            <button onClick={() => setScreen("ask")} style={navStyle(screen === "ask")}>
              <Ms name="search" size={18} color="inherit" />
              Ask
            </button>
            <button
              onClick={() => openEntity(entityRef ?? { type: "person", value: "Gloria Bennett" })}
              style={navStyle(screen === "entity")}
            >
              <Ms name="location_on" size={18} color="inherit" />
              Property / Person
            </button>
            <button onClick={goDash} style={navStyle(screen === "dashboard")}>
              <Ms name="monitoring" size={18} color="inherit" />
              Dashboard
            </button>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: MAX, margin: "0 auto", padding: "0 24px 80px" }}>
        {screen === "ask" && renderAsk()}
        {screen === "entity" && renderEntity()}
        {screen === "dashboard" && renderDashboard()}
      </main>

      <footer style={{ borderTop: "1px solid rgba(6,3,8,.1)", background: "#fff" }}>
        <div
          style={{
            maxWidth: MAX,
            margin: "0 auto",
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 12,
            color: C.muted2,
          }}
        >
          <Ms name="notifications" size={15} color={C.gold} />
          <span>Village of Bellwood Knowledge AI Hub · prototype</span>
          <span style={{ flex: 1 }} />
          <span>Grounded live over ~10,000 synthetic municipal messages · no real personal data</span>
        </div>
      </footer>
    </div>
  );

  // ════════════════════════ ASK ════════════════════════
  function renderAsk() {
    const resultsStyle: CSSProperties =
      layout === "split"
        ? { display: "flex", gap: 26, alignItems: "flex-start" }
        : { display: "flex", flexDirection: "column", gap: 24 };
    const answerColStyle: CSSProperties =
      layout === "split"
        ? { flex: "1 1 56%", minWidth: 0, position: "sticky", top: 90 }
        : layout === "focus"
          ? { width: "100%", maxWidth: 780, marginInline: "auto" }
          : { width: "100%" };
    const sourcesColStyle: CSSProperties =
      layout === "split"
        ? { flex: "1 1 44%", minWidth: 0 }
        : layout === "focus"
          ? { width: "100%", maxWidth: 980, marginInline: "auto" }
          : { width: "100%" };
    const sourcesGridStyle: CSSProperties =
      layout === "focus"
        ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 13 }
        : { display: "flex", flexDirection: "column", gap: 13 };

    const auto = result?.auto;
    const showAuto =
      !!auto && !autoDismissed && (!!auto.person || !!auto.address);
    const autoType = auto?.person ? "person" : "address";
    const autoVal = auto?.person || auto?.address || "";
    const sources = result?.sources ?? [];

    return (
      <section>
        {/* hero / search */}
        <div style={hasActive ? { maxWidth: "100%", margin: "26px 0 0" } : { maxWidth: 840, margin: "34px auto 0" }}>
          {!hasActive && (
            <div style={{ textAlign: "center", padding: "18px 0 22px" }}>
              <h1 style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 34, letterSpacing: "-.02em", margin: "0 0 10px", color: C.navy }}>
                Ask the village archive anything
              </h1>
              <p style={{ fontSize: 15.5, color: C.muted, maxWidth: 620, margin: "0 auto" }}>
                Plain-English answers grounded in every email and daily report — with each claim traceable to its source.
              </p>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "#fff",
              border: "1px solid rgba(6,3,8,.14)",
              borderRadius: 14,
              padding: "8px 8px 8px 18px",
              boxShadow: "0 1px 2px rgba(11,46,99,.05)",
            }}
          >
            <Ms name="search" size={24} color={C.navy} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runAsk(query);
              }}
              placeholder="Ask the village archive anything…"
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                background: "none",
                fontFamily: FONT_BODY,
                fontSize: 16.5,
                color: C.ink,
                padding: "10px 0",
                minWidth: 0,
              }}
            />
            <button
              onClick={() => setRefineOpen((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: refineOpen ? C.blueLightest : "#f2f4f7",
                color: refineOpen ? C.blue : C.muted,
                border: 0,
                borderRadius: 9,
                padding: "10px 13px",
                fontFamily: FONT_BODY,
                fontWeight: 600,
                fontSize: 13.5,
                cursor: "pointer",
                flex: "none",
              }}
            >
              <Ms name="tune" size={18} color="inherit" />
              Refine
            </button>
            <button
              onClick={() => runAsk(query)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                background: C.blue,
                color: "#fff",
                border: 0,
                borderRadius: 10,
                padding: "11px 18px",
                fontFamily: FONT_BODY,
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
                flex: "none",
              }}
            >
              Send
              <Ms name="arrow_forward" size={18} color="#fff" />
            </button>
          </div>

          {refineOpen && (
            <div
              style={{
                marginTop: 12,
                background: "#fff",
                border: "1px solid rgba(6,3,8,.14)",
                borderRadius: 14,
                padding: "18px 20px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
                gap: "16px 20px",
              }}
            >
              {(
                [
                  ["Person", "person", "e.g. Gloria Bennett", "text"],
                  ["Address / street", "address", "e.g. Bohland Ave", "text"],
                  ["Date from", "since", "", "date"],
                  ["Date to", "until", "", "date"],
                ] as const
              ).map(([label, key, ph, type]) => (
                <label key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={refineLabel}>{label}</span>
                  <input
                    value={filters[key]}
                    onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                    placeholder={ph}
                    type={type}
                    style={refineInput}
                  />
                </label>
              ))}
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={refineLabel}>Topic</span>
                <select
                  value={filters.topic}
                  onChange={(e) => setFilters({ ...filters, topic: e.target.value })}
                  style={{ ...refineInput, background: "none" }}
                >
                  <option value="">All topics</option>
                  {TOPIC_OPTIONS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {/* chips */}
        {!hasActive && (
          <div style={{ marginTop: 26 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>
              Try one of these
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {CHIPS.map((c, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(c.text);
                    runAsk(c.text);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "left",
                    background: "#fff",
                    border: "1px solid rgba(6,3,8,.14)",
                    borderRadius: 11,
                    padding: "11px 15px",
                    fontFamily: FONT_BODY,
                    fontSize: 14,
                    color: C.ink,
                    cursor: "pointer",
                    maxWidth: 340,
                    lineHeight: 1.35,
                  }}
                >
                  <Ms name="bolt" size={17} color={C.gold} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* results */}
        {hasActive && (
          <div style={{ marginTop: 26 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Ms name="forum" size={19} color={C.blue} />
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: C.navy,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 560,
                  }}
                >
                  {activeText}
                </span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: C.muted2, fontWeight: 600 }}>Layout</span>
                <div style={{ display: "inline-flex", background: "#e2e6ec", borderRadius: 9, padding: 3 }}>
                  <button onClick={() => setLayout("stacked")} style={segStyle(layout === "stacked")}>
                    Stacked
                  </button>
                  <button onClick={() => setLayout("split")} style={segStyle(layout === "split")}>
                    Split
                  </button>
                  <button onClick={() => setLayout("focus")} style={segStyle(layout === "focus")}>
                    Focus
                  </button>
                </div>
              </div>
            </div>

            {showAuto && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#fff7e6",
                  border: "1px solid #f0d28a",
                  borderRadius: 11,
                  padding: "10px 14px",
                  marginBottom: 18,
                  flexWrap: "wrap",
                }}
              >
                <Ms name="filter_alt" size={18} color="#cc8a00" />
                <span style={{ fontSize: 13.5, color: "#7a5a00" }}>
                  Auto-filtered to {autoType}: <strong style={{ color: "#5a4200" }}>{autoVal}</strong>
                </span>
                <button
                  onClick={() => openEntity({ type: autoType as "person" | "address", value: autoVal })}
                  style={{ background: "none", border: 0, color: C.blue, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  view single pane
                </button>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => {
                    setAutoDismissed(true);
                    runAsk(activeText, { noAuto: true });
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: 0, color: "#9a7a2a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  clear
                  <Ms name="close" size={15} color="#9a7a2a" />
                </button>
              </div>
            )}

            {loading && (
              <div>
                <div style={{ background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderRadius: 16, padding: "26px 28px", marginBottom: 22 }}>
                  <Shim w={170} h={14} mb={18} />
                  <Shim h={13} mb={11} />
                  <Shim w="94%" h={13} mb={11} />
                  <Shim w="88%" h={13} />
                  <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0 0", fontSize: 13, color: C.muted2 }}>
                    <Ms name="manage_search" size={16} color={C.blue} />
                    Searching the archive…
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[1, 2, 3].map((s) => (
                    <div key={s} style={{ background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderRadius: 14, padding: 18 }}>
                      <Shim w="60%" h={12} mb={12} />
                      <Shim h={11} mb={8} />
                      <Shim w="80%" h={11} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && askError && (
              <div style={{ background: "#fff", border: "1px solid #f0c0bd", borderTop: "3px solid #b3261e", borderRadius: 16, padding: "22px 26px", color: "#7a1c16" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                  <Ms name="error" size={20} color="#b3261e" />
                  <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 15, color: C.navy }}>Couldn&apos;t reach the archive</span>
                </div>
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{askError}</p>
              </div>
            )}

            {!loading && !askError && result && (
              <div style={resultsStyle}>
                <div style={answerColStyle}>
                  {result.mode === "rag" && renderRag(result, sources)}
                  {result.mode === "open_items" && renderOpen(result)}
                  {result.mode === "who_emails_most" && renderSenders(result)}
                </div>

                {result.mode === "rag" && sources.length > 0 && (
                  <div style={sourcesColStyle}>
                    <div
                      style={{
                        background: "#e7edf5",
                        border: "1px solid #d4deea",
                        borderTop: `3px solid ${C.navy}`,
                        borderRadius: 16,
                        padding: "4px 14px 16px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 2px 12px" }}>
                        <Ms name="inventory_2" size={18} color={C.navy} />
                        <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 14, color: C.navy }}>Sources</span>
                        <span style={{ fontSize: 12, color: C.muted2 }}>({sources.length})</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 11, color: C.muted2 }}>cited evidence · expand any card</span>
                      </div>
                      <div style={sourcesGridStyle}>
                        {sources.map((s) => (
                          <SourceCard key={s.index} s={s} active={activeCite === s.index} onOpenEntity={sourceEntity(s)} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  function renderRag(r: AskResponse, sources: Source[]) {
    return (
      <div style={{ background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderTop: `3px solid ${C.blue}`, borderRadius: 16, padding: "26px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16, flexWrap: "wrap" }}>
          <Ms name="auto_awesome" size={20} color={C.blue} />
          <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 15, color: C.navy }}>AI Answer</span>
          {r.crossSource && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: "#f1ebf4", color: "#623279", fontSize: 11, fontWeight: 600 }}>
              <Ms name="hub" size={13} color="#623279" />
              Cross-source
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: C.muted2 }}>{sources.length} sources · newest first</span>
        </div>
        {r.answer ? (
          <AnswerBody answer={r.answer} isRag activeCite={activeCite} onCite={cite} />
        ) : (
          <p style={{ fontSize: 15, color: C.muted, margin: 0 }}>No grounded answer was produced.</p>
        )}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(6,3,8,.08)", display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.muted2 }}>
          <Ms name="verified" size={15} color={C.green} />
          Every claim is cited to a source below. Click a marker to jump to it.
        </div>
      </div>
    );
  }

  function renderOpen(r: AskResponse) {
    const items = r.openItems ?? [];
    return (
      <div style={{ background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderTop: `3px solid ${C.gold}`, borderRadius: 16, padding: "24px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <Ms name="pending_actions" size={20} color="#cc8a00" />
          <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 15, color: C.navy }}>Still open</span>
        </div>
        <p style={{ fontSize: 14.5, color: C.muted, margin: "0 0 18px" }}>{r.answer}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((o, i) => {
            const clickable = !!o.entityPerson;
            return (
              <button
                key={i}
                onClick={clickable ? () => openEntity({ type: "person", value: o.entityPerson! }) : undefined}
                style={{ display: "flex", alignItems: "flex-start", gap: 13, textAlign: "left", background: "#fafbfc", border: "1px solid rgba(6,3,8,.1)", borderRadius: 12, padding: "13px 15px", cursor: clickable ? "pointer" : "default", width: "100%" }}
              >
                <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: "none", paddingTop: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#cc8a00" }}>{Math.round(o.score * 100)}</span>
                  <span style={{ fontSize: 9, color: C.muted3 }}>open</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{o.subject || "(no subject)"}</span>
                    <TopicChip topic={o.topic} />
                  </span>
                  <span style={{ display: "block", fontSize: 12.5, color: C.muted }}>
                    {o.fromName || "Unknown"} · {fmtDate(o.date)} — {o.why}
                  </span>
                </span>
                {clickable && <Ms name="chevron_right" size={18} color={C.muted3} style={{ flex: "none" }} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderSenders(r: AskResponse) {
    const who = r.who ?? { constituents: [], internal: [] };
    return (
      <div style={{ background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderTop: `3px solid ${C.blue}`, borderRadius: 16, padding: "24px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <Ms name="leaderboard" size={20} color={C.blue} />
          <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 15, color: C.navy }}>Who emails you the most</span>
        </div>
        <p style={{ fontSize: 14.5, color: C.muted, margin: "0 0 18px" }}>
          Split into constituents (outside email) and internal senders (departments &amp; daily reports).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 22 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.blue, textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 12px" }}>Constituents</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {who.constituents.map((row, i) => {
                const clickable = !!row.name;
                return (
                  <button
                    key={i}
                    onClick={clickable ? () => openEntity({ type: "person", value: row.name! }) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: 0, borderBottom: "1px solid rgba(6,3,8,.07)", padding: "4px 0 11px", cursor: clickable ? "pointer" : "default", textAlign: "left", width: "100%" }}
                  >
                    <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 15, color: C.navy, width: 30, textAlign: "right", flex: "none" }}>{row.count}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: C.ink }}>{row.name || "Unknown"}</span>
                      <span style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                        {(row.topicsList ?? []).slice(0, 2).map((tk) => (
                          <span key={tk} style={topicChipStyle(tk)}>{topicMeta(tk).label}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 12px" }}>Internal · daily reports</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {who.internal.map((row, i) => {
                const clickable = !!row.name;
                return (
                  <button
                    key={i}
                    onClick={clickable ? () => openEntity({ type: "person", value: row.name! }) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(6,3,8,.07)", padding: "4px 0 11px", background: "none", border: 0, width: "100%", textAlign: "left", cursor: clickable ? "pointer" : "default" }}
                  >
                    <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 15, color: C.muted, width: 34, textAlign: "right", flex: "none" }}>{row.count}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: C.ink }}>{row.name || "Unknown"}</span>
                      <span style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                        {(row.topicsList ?? []).slice(0, 1).map((tk) => (
                          <span key={tk} style={topicChipStyle(tk)}>{topicMeta(tk).label}</span>
                        ))}
                      </span>
                    </span>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", flex: "none", background: streamMeta(row.stream).color }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════ ENTITY ════════════════════════
  function renderEntity() {
    const ref = entityRef;
    const data = entityData;
    const icon = ref?.type === "address" ? "location_on" : "person";
    const typeLabel = ref?.type === "address" ? "Property / location" : "Resident / contact";
    return (
      <section style={{ paddingTop: 26 }}>
        <button
          onClick={() => setScreen("ask")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: 0, color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 16 }}
        >
          <Ms name="arrow_back" size={17} color={C.muted} />
          Back to Ask
        </button>

        {/* Look up ANY person or property */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 18,
            background: "#fff",
            border: "1px solid rgba(6,3,8,.12)",
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          <Ms name="search" size={18} color={C.navy} />
          <div style={{ display: "inline-flex", background: "#eef1f5", borderRadius: 8, padding: 3 }}>
            <button onClick={() => setLookupType("person")} style={segStyle(lookupType === "person")}>Person</button>
            <button onClick={() => setLookupType("address")} style={segStyle(lookupType === "address")}>Property</button>
          </div>
          <input
            value={lookupValue}
            onChange={(e) => setLookupValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && lookupValue.trim())
                openEntity({ type: lookupType, value: lookupValue.trim() });
            }}
            placeholder={
              lookupType === "person"
                ? "Search any resident or staff name…"
                : "Search any address or street…"
            }
            style={{
              flex: 1,
              minWidth: 200,
              border: 0,
              outline: 0,
              background: "none",
              fontFamily: FONT_BODY,
              fontSize: 14.5,
              color: C.ink,
              padding: "6px 2px",
            }}
          />
          <button
            onClick={() => {
              if (lookupValue.trim()) openEntity({ type: lookupType, value: lookupValue.trim() });
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: C.blue,
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "8px 15px",
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            Look up
            <Ms name="arrow_forward" size={16} color="#fff" />
          </button>
        </div>

        <div style={{ background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderRadius: 16, padding: "24px 26px", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
            <span style={{ width: 54, height: 54, borderRadius: 13, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Ms name={icon} size={28} color={C.gold} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: C.blue }}>
                {ref?.type} · single pane of glass
              </span>
              <h2 style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 26, letterSpacing: "-.02em", color: C.navy, margin: "3px 0" }}>
                {ref?.value}
              </h2>
              <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{typeLabel} · Bellwood, IL</p>
            </div>
            <button
              onClick={summarizeEntity}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.blue, color: "#fff", border: 0, borderRadius: 10, padding: "11px 16px", fontFamily: FONT_BODY, fontWeight: 600, fontSize: 14, cursor: "pointer", flex: "none" }}
            >
              <Ms name="auto_awesome" size={18} color="#fff" />
              Summarize &amp; suggest next action
            </button>
          </div>

          <div style={{ display: "flex", gap: 30, flexWrap: "wrap", marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(6,3,8,.08)" }}>
            <div>
              <div style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 24, color: C.navy }}>{data ? data.stats.count : "—"}</div>
              <div style={statLabel}>Messages</div>
            </div>
            <div>
              <div style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 16, color: C.navy, paddingTop: 6 }}>
                {data ? fmtRange(data.stats.firstDate, data.stats.lastDate) : "—"}
              </div>
              <div style={statLabel}>Date range</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4 }}>
                {(data?.stats.streams ?? []).map((s) => (
                  <span key={s} style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 6, background: "#f2f4f7", fontSize: 12, fontWeight: 600, color: C.muted }}>
                    {streamMeta(s).label}
                  </span>
                ))}
              </div>
              <div style={{ ...statLabel, marginTop: 6 }}>Departments involved</div>
            </div>
          </div>

          {entitySummaryOpen && (
            <div style={{ marginTop: 20, background: "#f5f8ff", border: "1px solid #cee0ff", borderRadius: 13, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13 }}>
                <Ms name="auto_awesome" size={19} color={C.blue} />
                <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 14, color: C.navy }}>AI Answer</span>
              </div>
              {entitySummaryLoading ? (
                <div>
                  <Shim h={13} mb={11} />
                  <Shim w="92%" h={13} mb={11} />
                  <Shim w="84%" h={13} />
                </div>
              ) : entitySummary?.answer ? (
                <AnswerBody answer={entitySummary.answer} isRag activeCite={null} onCite={() => {}} />
              ) : (
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>No synthesis available.</p>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Ms name="timeline" size={19} color={C.navy} />
          <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 16, color: C.navy }}>Full timeline</span>
          <span style={{ fontSize: 12.5, color: C.muted2 }}>newest first · every source stream</span>
        </div>

        {entityLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[1, 2, 3].map((s) => (
              <div key={s} style={{ background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderRadius: 14, padding: 18 }}>
                <Shim w="40%" h={12} mb={12} />
                <Shim h={11} mb={8} />
                <Shim w="80%" h={11} />
              </div>
            ))}
          </div>
        )}
        {entityError && <p style={{ fontSize: 14, color: "#b3261e" }}>{entityError}</p>}

        {!entityLoading && data && (
          <div style={{ position: "relative", paddingLeft: 4 }}>
            {data.messages.length === 0 && (
              <p style={{ fontSize: 14, color: C.muted, padding: "12px 0" }}>No messages found for this entity.</p>
            )}
            {data.messages.map((m) => {
              const sm = streamMeta(m.stream);
              const inbound = m.direction === "inbound";
              const dirColor = inbound ? C.blue : C.greenDark;
              return (
                <div key={m.id} style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: 18 }}>
                    <span style={{ width: 13, height: 13, borderRadius: "50%", background: sm.color, border: "3px solid #eef1f5", marginTop: 20, flex: "none", zIndex: 1 }} />
                    <span style={{ flex: 1, width: 2, background: "rgba(6,3,8,.1)" }} />
                  </div>
                  <Link
                    href={`/email?mid=${encodeURIComponent(m.messageId)}`}
                    target="_blank"
                    style={{ flex: 1, minWidth: 0, background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderRadius: 14, padding: "16px 18px", marginBottom: 14, textDecoration: "none", color: "inherit", display: "block", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <StreamPill stream={m.stream} />
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: dirColor }}>
                        <Ms name={inbound ? "south_west" : "north_east"} size={13} color={dirColor} />
                        {inbound ? "Inbound" : "Outbound"}
                      </span>
                      <TopicChip topic={m.topic} />
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, color: C.muted2, fontWeight: 600 }}>{fmtDate(m.date)}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{m.subject || "(no subject)"}</div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 7 }}>
                      {m.fromName || "Unknown"}
                      {m.fromEmail ? ` <${m.fromEmail}>` : ""}
                    </div>
                    <p style={{ fontSize: 13.5, lineHeight: 1.5, color: C.ink2, margin: 0 }}>{m.snippet}</p>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // ════════════════════════ DASHBOARD ════════════════════════
  function renderDashboard() {
    return (
      <section style={{ paddingTop: 30 }}>
        <h2 style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 26, letterSpacing: "-.02em", color: C.navy, margin: "0 0 4px" }}>
          Archive dashboard
        </h2>
        <p style={{ fontSize: 14.5, color: C.muted, margin: "0 0 26px" }}>
          Who&apos;s reaching the village, what&apos;s still open, and how the corpus breaks down.
        </p>

        {dashLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 20 }}>
            {[1, 2, 3].map((s) => (
              <div key={s} style={{ background: "#fff", border: "1px solid rgba(6,3,8,.12)", borderRadius: 16, padding: 24 }}>
                <Shim w="50%" h={14} mb={18} />
                <Shim h={12} mb={12} />
                <Shim w="90%" h={12} mb={12} />
                <Shim w="80%" h={12} />
              </div>
            ))}
          </div>
        )}
        {dashError && <p style={{ fontSize: 14, color: "#b3261e" }}>{dashError}</p>}

        {dash && renderDashboardBody(dash)}
      </section>
    );
  }

  function renderDashboardBody(d: DashboardResponse) {
    const maxC = Math.max(1, ...d.who.constituents.map((r) => r.count));
    const maxI = Math.max(1, ...d.who.internal.map((r) => r.count));
    const vol = d.volumeByMonth.slice(-6);
    const maxV = Math.max(1, ...vol.map((b) => b.count));
    const streamTotal = Math.max(1, d.byStream.reduce((a, b) => a + b.count, 0));
    const topicTotal = Math.max(1, d.byTopic.reduce((a, b) => a + b.count, 0));
    const streams = [...d.byStream].sort((a, b) => b.count - a.count).slice(0, 6);
    const topics = [...d.byTopic].sort((a, b) => b.count - a.count).slice(0, 8);
    const monthLabel = (m: string) => {
      const [y, mo] = m.split("-").map(Number);
      return new Date(Date.UTC(y, (mo || 1) - 1, 1)).toLocaleString("en-US", { month: "short" });
    };

    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 20, alignItems: "start" }}>
          {/* constituents */}
          <div style={cardStyle}>
            <div style={cardHead}>
              <Ms name="groups" size={19} color={C.blue} />
              <span style={cardTitle}>Top constituents</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {d.who.constituents.map((r, i) => {
                const clickable = !!r.name;
                return (
                  <button
                    key={i}
                    onClick={clickable ? () => openEntity({ type: "person", value: r.name! }) : undefined}
                    style={{ display: "block", background: "none", border: 0, padding: 0, cursor: clickable ? "pointer" : "default", textAlign: "left", width: "100%" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, flex: 1, minWidth: 0 }}>{r.name || "Unknown"}</span>
                      <span style={{ display: "flex", gap: 5 }}>
                        {(r.topicsList ?? []).slice(0, 2).map((tk) => (
                          <span key={tk} style={topicChipStyle(tk)}>{topicMeta(tk).label}</span>
                        ))}
                      </span>
                      <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 14, color: C.navy, width: 30, textAlign: "right" }}>{r.count}</span>
                    </div>
                    <span style={barTrack}>
                      <span style={{ display: "block", height: "100%", background: C.blue, width: `${(r.count / maxC) * 100}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* internal */}
          <div style={cardStyle}>
            <div style={cardHead}>
              <Ms name="forum" size={19} color={C.muted} />
              <span style={cardTitle}>Most-active internal senders</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {d.who.internal.map((r, i) => {
                const color = streamMeta(r.stream).color;
                const clickable = !!r.name;
                return (
                  <button
                    key={i}
                    onClick={clickable ? () => openEntity({ type: "person", value: r.name! }) : undefined}
                    style={{ display: "block", background: "none", border: 0, padding: 0, cursor: clickable ? "pointer" : "default", textAlign: "left", width: "100%" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", flex: "none", background: color }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, flex: 1, minWidth: 0 }}>{r.name || "Unknown"}</span>
                      <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 14, color: C.navy, width: 34, textAlign: "right" }}>{r.count}</span>
                    </div>
                    <span style={barTrack}>
                      <span style={{ display: "block", height: "100%", width: `${(r.count / maxI) * 100}%`, background: color }} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* open */}
          <div style={{ ...cardStyle, borderTop: `3px solid ${C.gold}` }}>
            <div style={cardHead}>
              <Ms name="pending_actions" size={19} color="#cc8a00" />
              <span style={cardTitle}>What&apos;s still open</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {d.openItems.map((o, i) => {
                const clickable = o.fromName && isKnownPerson(o.fromName);
                return (
                  <button
                    key={i}
                    onClick={clickable ? () => openEntity({ type: "person", value: o.fromName! }) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 11, background: "none", border: 0, borderBottom: "1px solid rgba(6,3,8,.07)", padding: "9px 0", cursor: clickable ? "pointer" : "default", textAlign: "left", width: "100%" }}
                  >
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted2, width: 46, flex: "none" }}>{fmtDateShort(o.date)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.subject || "(no subject)"}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{o.fromName || "Unknown"}</span>
                    </span>
                    <span style={topicChipStyle(o.topic)}>{topicMeta(o.topic).label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* charts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 20, marginTop: 20, alignItems: "start" }}>
          {/* volume */}
          <div style={cardStyle}>
            <div style={cardHead}>
              <Ms name="show_chart" size={19} color={C.blue} />
              <span style={cardTitle}>Message volume over time</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 150 }}>
              {vol.map((b, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{b.count}</span>
                  <span style={{ width: "100%", maxWidth: 40, borderRadius: "7px 7px 0 0", background: "linear-gradient(180deg,#0a66ff,#5393ff)", height: `${(b.count / maxV) * 100}%` }} />
                  <span style={{ fontSize: 11.5, color: C.muted2, fontWeight: 600 }}>{monthLabel(b.month)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* by stream */}
          <div style={cardStyle}>
            <div style={cardHead}>
              <Ms name="donut_small" size={19} color={C.violet} />
              <span style={cardTitle}>By source stream</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {streams.map((x, i) => {
                const sm = streamMeta(x.stream);
                const pct = Math.round((x.count / streamTotal) * 100);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <span style={{ fontSize: 13, color: C.ink, width: 96, flex: "none", fontWeight: 500 }}>{sm.label}</span>
                    <span style={{ flex: 1, height: 13, borderRadius: 7, background: "#eef1f5", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", borderRadius: 7, width: `${pct}%`, background: sm.color }} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, width: 34, textAlign: "right" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* by topic */}
          <div style={cardStyle}>
            <div style={cardHead}>
              <Ms name="category" size={19} color={C.green} />
              <span style={cardTitle}>By topic</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topics.map((x, i) => {
                const tm = topicMeta(x.topic);
                const pct = Math.round((x.count / topicTotal) * 100);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <span style={{ fontSize: 13, color: C.ink, width: 118, flex: "none", fontWeight: 500 }}>{tm.label}</span>
                    <span style={{ flex: 1, height: 11, borderRadius: 6, background: "#eef1f5", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", borderRadius: 6, width: `${pct}%`, background: tm.fg }} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, width: 34, textAlign: "right" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
  }
}

// ── shared style objects ─────────────────────────────────────────────────────
const refineLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b6a6e",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};
const refineInput: CSSProperties = {
  border: 0,
  borderBottom: "1px solid rgba(6,3,8,.2)",
  padding: "6px 0",
  fontFamily: "'Inter',sans-serif",
  fontSize: 14.5,
  outline: 0,
  color: "#1e1c20",
};
const statLabel: CSSProperties = {
  fontSize: 12,
  color: "#9a999c",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};
const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(6,3,8,.12)",
  borderRadius: 16,
  padding: "22px 24px",
};
const cardHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 16,
};
const cardTitle: CSSProperties = {
  fontFamily: "'Sora',sans-serif",
  fontWeight: 600,
  fontSize: 15,
  color: "#0b2e63",
};
const barTrack: CSSProperties = {
  display: "block",
  height: 6,
  borderRadius: 3,
  background: "#eef1f5",
  overflow: "hidden",
};
