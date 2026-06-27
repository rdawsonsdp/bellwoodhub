/*
 * source-types.ts — the registry for agent-driven "Upload Source" ingestion.
 *
 * Each SourceType is a human-confirmed connector: it declares the canonical
 * defaults (stream, topic, sensitivity → storage routing) and the Layer-C
 * structured fields the Ingestion Agent extracts from the document. A new
 * document type is added HERE (in code, by the technical team) — the mayor
 * never configures schemas. This mirrors the Staff-Agent model.
 *
 * Field → column mapping (see PROJECT.md DEC-5):
 *   title/date/author/summary/sensitivity → canonical.messages (the Envelope)
 *   entities                              → canonical.entity_aliases + edges
 *   topic                                 → canonical.message_topics (→ stream, read-time)
 *   fields (Layer C)                      → messages.provenance (filterable facets)
 *   summary + narrative                   → canonical.chunks (Voyage-embedded → AI Search)
 */
import type { StreamKey } from "./types";

export type Sensitivity = "public" | "internal" | "restricted";

export interface FieldDef {
  key: string;
  label: string;
  kind?: "text" | "date" | "textarea";
}

export interface SourceType {
  key: string; // stable → messages.source
  label: string;
  blurb: string;
  icon: string; // svg path data
  stream: StreamKey;
  topic: string; // → message_topics.topic
  sensitivity: Sensitivity;
  fields: FieldDef[]; // Layer-C structured indicators
}

/** Where the original file lives, derived from sensitivity (DEC-4). */
export function storageRoute(s: Sensitivity): { label: string; note: string; secure: boolean } {
  if (s === "restricted")
    return {
      label: "Secured AWS store",
      note: "Original kept in an encrypted, access-controlled S3 store (CJIS-grade). The app holds only the searchable metadata + RAG — never the file. In this demo nothing is persisted.",
      secure: true,
    };
  if (s === "public")
    return { label: "Supabase Storage · public", note: "Original stored in Supabase; openly linkable. raw_ref points to it.", secure: false };
  return { label: "Supabase Storage · internal", note: "Original stored in Supabase, staff-only. raw_ref points to it.", secure: false };
}

export const SENSITIVITY_META: Record<Sensitivity, { label: string; color: string }> = {
  public: { label: "Public", color: "#4fb477" },
  internal: { label: "Internal", color: "#e7b53c" },
  restricted: { label: "Restricted", color: "#ff6b5e" },
};

export const SOURCE_TYPES: SourceType[] = [
  {
    key: "fire_report",
    label: "Fire / EMS report",
    blurb: "Incident & run reports from the fire department.",
    icon: "M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .4-2 1-2.5C9 9 12 8 12 2zM7 14a5 5 0 0 0 10 0",
    stream: "Fire/EMS",
    topic: "fire_ems",
    sensitivity: "internal",
    fields: [
      { key: "incident_no", label: "Incident #" },
      { key: "incident_type", label: "Incident type" },
      { key: "address", label: "Address / location" },
      { key: "units", label: "Units responding" },
      { key: "injuries", label: "Injuries / fatalities" },
      { key: "cause", label: "Cause / origin" },
      { key: "disposition", label: "Disposition" },
      { key: "narrative", label: "Narrative", kind: "textarea" },
    ],
  },
  {
    key: "police_report",
    label: "Police report / blotter",
    blurb: "Incident & case reports from the police department.",
    icon: "M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z",
    stream: "Police",
    topic: "public_safety",
    sensitivity: "restricted", // CJIS — routed to the secured store
    fields: [
      { key: "case_no", label: "Case / RD #" },
      { key: "offense", label: "Offense / incident type" },
      { key: "location", label: "Location" },
      { key: "parties", label: "Parties involved" },
      { key: "officer", label: "Reporting officer" },
      { key: "disposition", label: "Disposition" },
      { key: "narrative", label: "Narrative", kind: "textarea" },
    ],
  },
  {
    key: "permit",
    label: "Permit / code enforcement",
    blurb: "Building permits, inspections, code cases.",
    icon: "M9 2h6l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM9 12h6M9 16h6",
    stream: "Business",
    topic: "permits",
    sensitivity: "internal",
    fields: [
      { key: "permit_no", label: "Permit / case #" },
      { key: "property", label: "Property / parcel" },
      { key: "applicant", label: "Applicant" },
      { key: "work_type", label: "Type of work" },
      { key: "inspector", label: "Inspector" },
      { key: "status", label: "Status" },
    ],
  },
  {
    key: "document",
    label: "General document",
    blurb: "Minutes, letters, memos, notices — the agent infers the rest.",
    icon: "M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 12h8M8 16h8M8 8h4",
    stream: "Interdepartmental",
    topic: "complaint",
    sensitivity: "internal",
    fields: [
      { key: "doc_type", label: "Document type" },
      { key: "reference", label: "Reference #" },
      { key: "parties", label: "People / orgs named" },
      { key: "summary_long", label: "Key points", kind: "textarea" },
    ],
  },
];

export const getSourceType = (key: string) => SOURCE_TYPES.find((t) => t.key === key);

/* ── simulated agent extraction (demo, keyless) ──
 * Phase 2 swaps this for a real OpenAI-vision parse. The shape it returns is
 * exactly what the live parser will produce, so the review form is unchanged. */
export interface EntityDraft { name: string; kind: string; confidence: number; }
export interface IngestDraft {
  typeKey: string;
  title: string;
  stream: StreamKey;
  topic: string;
  sensitivity: Sensitivity;
  date: string; // YYYY-MM-DD
  author: string;
  summary: string;
  fields: Record<string, string>;
  entities: EntityDraft[];
  pii: string[];
}

const STREETS = ["Oak St", "Eastern Ave", "St Charles Rd", "25th Ave", "Bellwood Ave", "Washington Blvd", "Marshall Ave", "Frederick Ave"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const num = (n: number) => Math.floor(Math.random() * n);
const todayISO = () => new Date().toISOString().slice(0, 10);

export function simulateExtraction(typeKey: string, fileName: string): IngestDraft {
  const t = getSourceType(typeKey)!;
  const addr = `${100 + num(900)} ${pick(STREETS)}`;
  const base = { typeKey, stream: t.stream, topic: t.topic, sensitivity: t.sensitivity, date: todayISO(), pii: [] as string[] };

  if (typeKey === "fire_report") {
    const itype = pick(["Structure fire", "EMS — medical", "Vehicle fire", "Alarm activation", "Hazmat — minor"]);
    const inj = pick(["None", "1 minor (treated on scene)", "1 transported", "None — occupants evacuated"]);
    return {
      ...base,
      title: `Fire/EMS — ${itype}, ${addr}`,
      author: "Bellwood Fire Dept · Shift Cmdr.",
      summary: `${itype} at ${addr}. ${pick(["Engine 41", "Engine 41 & Truck 9", "Ambulance 9"])} responded. ${inj}. Cause ${pick(["electrical", "cooking", "undetermined", "unattended candle"])}; scene cleared.`,
      fields: {
        incident_no: `BFD-${new Date().getFullYear()}-${1000 + num(9000)}`,
        incident_type: itype, address: addr,
        units: pick(["Engine 41", "Engine 41, Ambulance 9", "Engine 41, Truck 9, Ambulance 9"]),
        injuries: inj, cause: pick(["Electrical", "Cooking", "Undetermined", "Unattended candle"]),
        disposition: pick(["Cleared", "Transferred to PD", "Referred to code enforcement"]),
        narrative: `Units dispatched to ${addr} for a reported ${itype.toLowerCase()}. On arrival, crews found ${pick(["light smoke", "active fire in the kitchen", "an automatic alarm, no fire"])}. ${inj}. Cause determined to be ${pick(["electrical", "cooking-related", "undetermined"])}. Scene turned over to ${pick(["the owner", "police", "code enforcement"])}.`,
      },
      entities: [
        { name: addr, kind: "address", confidence: 0.96 },
        { name: pick(["Engine 41", "Ambulance 9"]), kind: "department", confidence: 0.9 },
        { name: pick(["R. Alvarez", "M. Donnelly", "T. Okafor"]), kind: "person", confidence: 0.82 },
      ],
      pii: ["address"],
    };
  }
  if (typeKey === "police_report") {
    const off = pick(["Theft from vehicle", "Disturbance", "Property damage", "Welfare check", "Traffic incident"]);
    return {
      ...base,
      title: `Police — ${off}, ${addr}`,
      author: "Bellwood PD · Records",
      summary: `${off} reported at ${addr}. Report taken; ${pick(["case open", "referred to investigations", "cleared by report"])}.`,
      fields: {
        case_no: `BPD-${new Date().getFullYear()}-${10000 + num(90000)}`,
        offense: off, location: addr,
        parties: pick(["1 complainant", "complainant + 1 witness", "2 parties"]),
        officer: `Ofc. ${pick(["Reyes", "Kowalski", "Bana", "Schmidt"])} #${100 + num(800)}`,
        disposition: pick(["Open", "Referred to investigations", "Cleared by report"]),
        narrative: `Complainant reported ${off.toLowerCase()} at ${addr}. Officer responded, took a report, and ${pick(["canvassed the area", "collected a statement", "advised the complainant"])}.`,
      },
      entities: [
        { name: addr, kind: "address", confidence: 0.95 },
        { name: pick(["J. Carter", "D. Owens", "L. Pruitt"]), kind: "person", confidence: 0.78 },
      ],
      pii: ["address", "name"],
    };
  }
  if (typeKey === "permit") {
    return {
      ...base,
      title: `Permit — ${pick(["roof replacement", "deck addition", "electrical service", "sign installation"])}, ${addr}`,
      author: "Village of Bellwood · Building Dept.",
      summary: `Building permit at ${addr}. ${pick(["Approved", "Pending inspection", "Issued"])}.`,
      fields: {
        permit_no: `BP-${new Date().getFullYear()}-${500 + num(500)}`,
        property: addr, applicant: pick(["Homeowner", "ABC Contracting", "Westside Builders LLC"]),
        work_type: pick(["Roof replacement", "Deck addition", "Electrical service upgrade", "Sign installation"]),
        inspector: pick(["A. Flores", "B. Nguyen", "C. Patel"]),
        status: pick(["Issued", "Pending inspection", "Approved", "Final passed"]),
      },
      entities: [
        { name: addr, kind: "parcel", confidence: 0.94 },
        { name: pick(["ABC Contracting", "Westside Builders LLC"]), kind: "business", confidence: 0.85 },
      ],
      pii: ["address"],
    };
  }
  // general document
  return {
    ...base,
    title: fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ") || "Uploaded document",
    author: pick(["Village Clerk", "Public Works", "Mayor's Office"]),
    summary: `Document ingested from ${fileName}. Agent extracted key parties and dates for search.`,
    fields: {
      doc_type: pick(["Meeting minutes", "Resident letter", "Internal memo", "Public notice"]),
      reference: `DOC-${1000 + num(9000)}`,
      parties: pick(["Village Board", "Public Works Dir.", "a resident"]),
      summary_long: "Key points extracted by the Ingestion Agent for indexing.",
    },
    entities: [{ name: pick(["Village Board", "Public Works"]), kind: "organization", confidence: 0.8 }],
    pii: [],
  };
}
