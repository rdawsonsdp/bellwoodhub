export type Direction = "inbound" | "outbound";

export type StreamKey =
  | "Police"
  | "Fire/EMS"
  | "Regional"
  | "Interdepartmental"
  | "Business"
  | "Civic/FOIA"
  | "Resident";

export interface Source {
  index: number; // 1-based, newest-first — matches the inline [n] citations in the answer
  score: number; // 1 - cosine distance
  direction: Direction;
  date: string; // ISO
  fromName: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  subject: string | null;
  topic: string | null;
  stream: StreamKey;
  snippet: string;
  messageId: string;
  threadId: string | null;
}

export type AskMode = "rag" | "open_items" | "who_emails_most";

export interface WhoRow {
  name: string | null;
  email: string | null;
  count: number;
  topics?: string | null;
  topicsList?: string[];
  stream?: StreamKey;
}

export interface OpenItem {
  score: number;
  date: string;
  fromName: string | null;
  subject: string | null;
  topic: string | null;
  stream: StreamKey;
  why: string;
  entityPerson?: string; // known sender → single-pane drill-in
}

export interface EmailDetail {
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  cc: string | null;
  direction: Direction;
  topic: string | null;
  stream: StreamKey;
  date: string;
  bodyClean: string;
  bodyRaw: string;
}

export interface AppliedFilters {
  person?: string;
  address?: string;
  since?: string;
  until?: string;
  topic?: string;
}

export interface AskResponse {
  mode: AskMode;
  question: string;
  auto?: { person?: string; address?: string }; // only the filters the system inferred
  applied?: AppliedFilters;
  answer?: string; // rag: grounded answer; open_items: one-line lede
  sources?: Source[]; // rag
  crossSource?: boolean; // rag — answer spans 3+ source streams
  openItems?: OpenItem[]; // open_items
  who?: { constituents: WhoRow[]; internal: WhoRow[] }; // who_emails_most
}

export interface TimelineMessage {
  id: string;
  date: string;
  direction: Direction;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  topic: string | null;
  stream: StreamKey;
  snippet: string;
  messageId: string;
  threadId: string | null;
}

export interface EntityResponse {
  type: "person" | "address";
  value: string;
  stats: {
    count: number;
    firstDate: string | null;
    lastDate: string | null;
    streams: StreamKey[];
  };
  messages: TimelineMessage[];
}

export interface DashboardResponse {
  who: { constituents: WhoRow[]; internal: WhoRow[] };
  openItems: Source[];
  volumeByMonth: { month: string; count: number }[];
  byStream: { stream: string; count: number }[];
  byTopic: { topic: string; count: number }[];
  totals: { emails: number; chunks: number };
}
