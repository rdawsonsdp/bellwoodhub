/*
 * ingested-sources.ts — Phase-1 (demo) store for documents committed through the
 * Upload Source flow. Kept in localStorage so committed uploads persist across the
 * session and immediately surface in the Sources activity log — no backend needed.
 * Phase 3 replaces this with real canonical writes (messages/entity_aliases/chunks).
 */
import type { IngestDraft } from "./source-types";

export interface IngestedRecord extends IngestDraft {
  id: string;
  ingestedAt: string; // ISO
  fileName: string;
  storageLabel: string; // where the original was routed (DEC-4)
}

const KEY = "bw-ingested-sources-v1";

export function getIngested(): IngestedRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as IngestedRecord[]) : [];
  } catch {
    return [];
  }
}

export function addIngested(rec: IngestedRecord): void {
  try {
    const all = getIngested();
    all.unshift(rec);
    window.localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

export function newId(): string {
  // session-unique without Date.now collisions across rapid commits
  return "ing-" + Math.random().toString(36).slice(2, 9);
}
