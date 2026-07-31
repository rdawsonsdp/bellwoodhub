"use client";
/*
 * ModelPicker — the model selector that sits in the lower-right of the Ask box
 * (RD 2026-07-31), the same affordance Claude.ai puts under its composer.
 *
 * Two things make this more than a dropdown:
 *   LIVE CATALOG. Options come from /api/model, which reads the Models API, so
 *   a new model appears here without a deploy. The repo's old hardcoded list
 *   had gone stale by two generations and mispriced Opus by 3x.
 *   ONE SETTING, EVERYWHERE. The choice is stored server-side, so the hourly
 *   cabinet pass runs on whatever is picked here — not just this browser tab.
 */
import { useEffect, useRef, useState } from "react";
import { C, FONT } from "@/lib/cos-design";

interface CatalogModel {
  id: string; label: string; family: string;
  inPer1M: number | null; outPer1M: number | null; pricingUnknown: boolean;
}

/** Opus 5 → "Opus 5". The API's display name is already friendly; this just
 *  drops the vendor prefix so the control stays small. */
const short = (m: CatalogModel) => m.label.replace(/^Claude\s+/i, "");

export default function ModelPicker({ compact = false }: { compact?: boolean }) {
  const [models, setModels] = useState<CatalogModel[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/model")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { models?: CatalogModel[]; selected?: string }) => {
        if (!alive) return;
        setModels(d.models ?? []);
        // `selected` is a TIER id ("opus-5"); catalog ids are "claude-opus-5".
        // The old fuzzy match ("opus5") matched nothing and silently fell through
        // to the first opus-family entry, so the control could display a model
        // the user had not chosen (RD 2026-07-31).
        const list = d.models ?? [];
        const sel = d.selected ?? "";
        const hit = list.find((m) => m.id === sel)                   // exact id
          ?? list.find((m) => m.id === `claude-${sel}`)              // tier -> canonical id
          ?? list.find((m) => m.id.replace(/^claude-/, "") === sel)  // reverse
          ?? list.find((m) => m.family === sel.split("-")[0]);       // family fallback
        setSelected(hit?.id ?? null);
      })
      .catch(() => alive && setModels([]));
    return () => { alive = false; };
  }, []);

  // close on outside click — a picker that traps the page is worse than none
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = async (m: CatalogModel) => {
    setSelected(m.id); setOpen(false); setSaving(true);
    try {
      await fetch("/api/model", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: m.id }),
      });
    } finally { setSaving(false); }
  };

  const current = models?.find((m) => m.id === selected) ?? null;
  if (!models) return null;

  return (
    <div ref={box} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${current ? short(current) : "default"}. Change model.`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
          background: "none", border: 0, padding: "3px 4px", borderRadius: 7,
          fontFamily: FONT.sans, fontSize: compact ? 10.5 : 11.5, fontWeight: 600,
          color: saving ? C.gold : C.dim, opacity: saving ? 0.85 : 1,
        }}
      >
        {current ? short(current) : "Model"}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
          <path d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", right: 0, zIndex: 60,
            minWidth: 264, maxHeight: 320, overflowY: "auto",
            background: "var(--c-appbg)", border: `1px solid ${C.line}`, borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,.34)", padding: 6,
          }}
          className="scrl"
        >
          {models.map((m) => {
            const on = m.id === selected;
            return (
              <button
                key={m.id}
                role="option"
                aria-selected={on}
                onClick={() => choose(m)}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  background: on ? "rgba(231,181,60,.12)" : "transparent",
                  border: 0, borderRadius: 9, padding: "8px 10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 700, color: on ? C.gold : C.text }}>
                    {short(m)}
                  </span>
                  <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 9.5, color: C.dim }}>
                    {/* never invent a rate we don't have */}
                    {m.pricingUnknown ? "—" : `$${m.inPer1M}/$${m.outPer1M} per M`}
                  </span>
                </div>
              </button>
            );
          })}
          <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.dim, padding: "7px 10px 3px", lineHeight: 1.45, borderTop: `1px solid ${C.line2}`, marginTop: 4 }}>
            Applies to Ask and to your agents&apos; scheduled runs.
          </div>
        </div>
      )}
    </div>
  );
}
