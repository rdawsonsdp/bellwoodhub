/*
 * gdrive.ts — Google Drive as a data source. The first connector that isn't a
 * mailbox, and the one that proves the rest are cheap.
 *
 * It implements the same Connector contract as Gmail and Graph, because a
 * document maps onto the record shape without strain:
 *
 *     file name       → subject
 *     owner           → from
 *     modified time   → sentAt
 *     extracted text  → bodyText
 *     parent folder   → threadRef   (files in a folder group like a thread)
 *     drive file id   → sourceRef
 *
 * That mapping is why focus retrieval, the agents, Ask, and citations need no
 * changes at all: a Drive file IS a record, and every agent instructed to watch
 * for something will find it the day it lands.
 *
 * ACCESS MODEL — read this before changing the queries. The connector sees only
 * what the connected Google account can already open:
 *   - shared drives it is a member of (`drives.list` → per-drive file listing)
 *   - items shared directly with it (`sharedWithMe = true`)
 * It deliberately does NOT read the user's own My Drive, and public links play
 * no part. If access is revoked in Drive, the next sync simply stops seeing the
 * files — the permission remains the user's to grant and withdraw.
 *
 * TEXT EXTRACTION. Native Google formats export to text through the API with no
 * dependency. PDFs and .xlsx need a parser, and a file we cannot read is
 * REPORTED, never silently skipped — a document that quietly failed to extract
 * is indistinguishable from one that said nothing, and an agent would report
 * "nothing found" with total confidence.
 */
import type { Connector, PulledMessage } from "./types";

const DRIVE = "https://www.googleapis.com/drive/v3";

/** What the operator can ask for during the interview. */
export type DriveFileType = "pdf" | "spreadsheet" | "document" | "presentation";

/** Which slice of Drive to walk. */
export type DriveScope = "shared" | "sharedWithMe" | "both";

export interface DriveConfig {
  fileTypes: DriveFileType[];
  scope: DriveScope;
}

/** MIME types per operator-facing file type. Google-native formats and their
 *  uploaded equivalents are the same choice to a user, so they group together. */
const MIME: Record<DriveFileType, string[]> = {
  pdf: ["application/pdf"],
  spreadsheet: [
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
  ],
  document: [
    "application/vnd.google-apps.document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
  ],
  presentation: [
    "application/vnd.google-apps.presentation",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

/** Google-native docs can't be downloaded — they export. Everything else is a
 *  straight media download. */
const EXPORT_AS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
  driveId?: string;
  owners?: { displayName?: string; emailAddress?: string }[];
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

async function driveGet<T>(accessToken: string, path: string, params: Record<string, string>): Promise<T> {
  const r = await fetch(`${DRIVE}${path}?${q(params)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`Drive ${path} failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

/** A single `q` clause covering every MIME type the operator asked for. */
function mimeClause(fileTypes: DriveFileType[]): string {
  const mimes = fileTypes.flatMap((t) => MIME[t] ?? []);
  if (!mimes.length) return "";
  return `(${mimes.map((m) => `mimeType='${m}'`).join(" or ")})`;
}

/** Shared drives this account belongs to. Empty when the account is in none —
 *  which is normal for a personal Google account and not an error. */
async function listSharedDrives(accessToken: string): Promise<{ id: string; name: string }[]> {
  const res = await driveGet<{ drives?: { id: string; name: string }[] }>(
    accessToken, "/drives", { pageSize: "100", fields: "drives(id,name)" },
  ).catch(() => ({ drives: [] }));
  return res.drives ?? [];
}

const FILE_FIELDS =
  "nextPageToken,files(id,name,mimeType,modifiedTime,size,parents,webViewLink,driveId," +
  "owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))";

/**
 * Files the account can see, honouring the configured scope.
 *
 * `modifiedAfter` is the incremental cursor: Drive has a changes API, but a
 * modifiedTime watermark is simpler, needs no per-drive change tokens, and is
 * correct for an append-mostly document store. A file edited after the
 * watermark is re-pulled and re-lands as a new RAW version — which is the
 * behaviour you want for a document that changed.
 */
async function listFiles(
  accessToken: string,
  cfg: DriveConfig,
  modifiedAfter: string | null,
  cap: number,
): Promise<DriveFile[]> {
  const clauses = ["trashed = false"];
  const mime = mimeClause(cfg.fileTypes);
  if (mime) clauses.push(mime);
  if (modifiedAfter) clauses.push(`modifiedTime > '${modifiedAfter}'`);

  const out: DriveFile[] = [];
  const wantShared = cfg.scope === "shared" || cfg.scope === "both";
  const wantSharedWithMe = cfg.scope === "sharedWithMe" || cfg.scope === "both";

  // 1. Shared drives — one pass per drive, scoped to that drive's corpus.
  if (wantShared) {
    for (const d of await listSharedDrives(accessToken)) {
      let pageToken: string | undefined;
      do {
        const res = await driveGet<{ files?: DriveFile[]; nextPageToken?: string }>(
          accessToken, "/files",
          {
            q: clauses.join(" and "),
            fields: FILE_FIELDS,
            pageSize: "100",
            orderBy: "modifiedTime",
            corpora: "drive",
            driveId: d.id,
            includeItemsFromAllDrives: "true",
            supportsAllDrives: "true",
            ...(pageToken ? { pageToken } : {}),
          },
        );
        out.push(...(res.files ?? []));
        pageToken = res.nextPageToken;
      } while (pageToken && out.length < cap);
      if (out.length >= cap) break;
    }
  }

  // 2. Items shared directly with this account (not a formal shared drive).
  if (wantSharedWithMe && out.length < cap) {
    let pageToken: string | undefined;
    do {
      const res = await driveGet<{ files?: DriveFile[]; nextPageToken?: string }>(
        accessToken, "/files",
        {
          q: [...clauses, "sharedWithMe = true"].join(" and "),
          fields: FILE_FIELDS,
          pageSize: "100",
          orderBy: "modifiedTime",
          includeItemsFromAllDrives: "true",
          supportsAllDrives: "true",
          ...(pageToken ? { pageToken } : {}),
        },
      );
      out.push(...(res.files ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken && out.length < cap);
  }

  // Dedup (a file can appear in both passes) and keep oldest-first so the
  // modifiedTime watermark advances monotonically.
  const seen = new Set<string>();
  return out
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime))
    .slice(0, cap);
}

/** Thrown when a file is found but its text can't be read. Surfaced to the
 *  caller rather than swallowed — see the header note on silent skips. */
export class ExtractionError extends Error {
  constructor(readonly file: string, readonly why: string) {
    super(`${file}: ${why}`);
    this.name = "ExtractionError";
  }
}

/** Extract text. Google-native formats export through the API; PDF and xlsx
 *  need parsers, loaded lazily so the module stays importable without them. */
export async function extractText(accessToken: string, f: DriveFile): Promise<string> {
  const exportAs = EXPORT_AS[f.mimeType];

  if (exportAs) {
    const r = await fetch(
      `${DRIVE}/files/${f.id}/export?${q({ mimeType: exportAs })}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!r.ok) throw new ExtractionError(f.name, `export failed (${r.status})`);
    return await r.text();
  }

  const r = await fetch(
    `${DRIVE}/files/${f.id}?${q({ alt: "media", supportsAllDrives: "true" })}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!r.ok) throw new ExtractionError(f.name, `download failed (${r.status})`);

  if (f.mimeType === "text/plain" || f.mimeType === "text/csv" || f.mimeType === "text/markdown") {
    return await r.text();
  }

  const buf = Buffer.from(await r.arrayBuffer());

  if (f.mimeType === "application/pdf") {
    try {
      // pdf-parse v2 exports a PDFParse class, not a default function.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const { text } = await parser.getText();
      // A scanned PDF parses successfully and yields nothing. That is not an
      // empty document — it is an unread one, and it needs OCR. Say so.
      if (text.trim().length < 20) {
        throw new ExtractionError(f.name, "no extractable text — likely a scan needing OCR");
      }
      return text;
    } catch (e) {
      if (e instanceof ExtractionError) throw e;
      throw new ExtractionError(f.name, `PDF parse failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (
    f.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    f.mimeType === "application/vnd.ms-excel"
  ) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "buffer" });
      // Every sheet, labelled — a workbook's tab names are meaningful content
      // ("Q3 Orders", "Cancelled") and drop out of a bare CSV dump.
      return wb.SheetNames.map(
        (n) => `## ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`,
      ).join("\n\n");
    } catch (e) {
      throw new ExtractionError(f.name, `spreadsheet parse failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  throw new ExtractionError(f.name, `unsupported type ${f.mimeType}`);
}

/** A Drive file as a record. See the header for the field mapping. */
export function toPulled(f: DriveFile, text: string, address: string): PulledMessage {
  const owner = f.owners?.[0] ?? f.lastModifyingUser ?? {};
  return {
    sourceRef: `gdrive:${f.id}`,
    // Folder as thread: files that live together are about the same thing, and
    // the runner's same-thread context arm then surrounds a document with its
    // siblings exactly as it surrounds an email with its replies.
    threadRef: `gdrive-folder:${f.parents?.[0] ?? f.driveId ?? "root"}`,
    direction: "inbound",
    fromName: owner.displayName ?? null,
    fromEmail: owner.emailAddress ?? null,
    toEmail: address,
    cc: null,
    subject: f.name,
    sentAt: f.modifiedTime,
    bodyHtml: null,
    bodyText: text,
    hasAttachments: false,
    provider: "gmail", // the contract's union; provenance._source carries 'gdrive'
    address,
  };
}

export function gdriveConnector(address: string, cfg: DriveConfig): Connector & {
  pullFiles(accessToken: string, cursor: string | null, cap: number): Promise<{
    messages: PulledMessage[];
    nextCursor: string | null;
    failures: { file: string; why: string }[];
  }>;
} {
  async function refreshAccessToken(refreshToken: string) {
    const body = new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!r.ok) throw new Error(`Google token refresh failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    return { accessToken: j.access_token, expiresIn: j.expires_in };
  }

  /** Pull with per-file isolation: one unreadable file must not cost the round.
   *  Same posture as the email ingest fix — failures are counted and reported. */
  async function pullFiles(accessToken: string, cursor: string | null, cap: number) {
    const files = await listFiles(accessToken, cfg, cursor, cap);
    const messages: PulledMessage[] = [];
    const failures: { file: string; why: string }[] = [];
    let watermark = cursor;

    for (const f of files) {
      try {
        const text = await extractText(accessToken, f);
        messages.push(toPulled(f, text, address));
      } catch (e) {
        failures.push({
          file: f.name,
          why: e instanceof ExtractionError ? e.why : e instanceof Error ? e.message : String(e),
        });
      }
      // Advance past a file we couldn't read too — otherwise one bad PDF pins
      // the watermark and the connector re-reads it forever. The failure is
      // reported instead.
      if (!watermark || f.modifiedTime > watermark) watermark = f.modifiedTime;
    }
    return { messages, nextCursor: watermark, failures };
  }

  return {
    refreshAccessToken,
    async listNewest(accessToken, n) {
      const { messages } = await pullFiles(accessToken, null, n);
      return messages;
    },
    async pullSince(accessToken, cursor, cap) {
      const { messages, nextCursor } = await pullFiles(accessToken, cursor, cap);
      return { messages, nextCursor };
    },
    async mailboxTotal(accessToken) {
      // Drive gives no cheap total for an arbitrary query; the Sync page shows
      // a count without a denominator rather than a made-up one.
      void accessToken;
      return null;
    },
    pullFiles,
  };
}
