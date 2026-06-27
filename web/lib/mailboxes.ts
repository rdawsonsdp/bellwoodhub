/*
 * mailboxes.ts — the mayor's connected mailboxes (the "source system" dimension).
 *
 * A Mailbox is the account an email lives in — distinct from messages.source
 * (the connector type). The mayor filters his inbox by Mailbox. Each mailbox
 * carries its provider (Outlook / Gmail) and, importantly, a privacy posture:
 *
 *   - Government (Outlook) is the public record: FOIA-scoped, default-visible,
 *     part of AI Search by default.
 *   - Business (Gmail) is WALLED (DEC-6): private, NOT FOIA-indexed, and excluded
 *     from default search — visible only when the mayor explicitly switches to it.
 *
 * New mailboxes are added here (or, in production, via an OAuth "Add mailbox"
 * grant that writes a canonical.mailboxes row). Same registry pattern as Staff
 * Agents — configured by the technical team, not the mayor.
 */
export type Provider = "outlook" | "gmail" | "imap";

export interface Mailbox {
  id: string; // stable tag stamped on every message (the filter key)
  label: string; // full name
  short: string; // chip label
  provider: Provider;
  address: string;
  color: string;
  isPrivate: boolean; // walled — not part of the public record
  foiaScope: boolean; // included in FOIA-style indexing
  isDefault: boolean;
}

export const MAILBOXES: Mailbox[] = [
  {
    id: "gov",
    label: "Bellwood Government",
    short: "Government",
    provider: "outlook",
    address: "mayor@villageofbellwood.gov",
    color: "#67adff",
    isPrivate: false,
    foiaScope: true,
    isDefault: true,
  },
  {
    id: "biz",
    label: "Bellwood Business",
    short: "Business",
    provider: "gmail",
    address: "merrill.bellwood@gmail.com",
    color: "#9d8bff",
    isPrivate: true,
    foiaScope: false,
    isDefault: false,
  },
];

export const PROVIDER_META: Record<Provider, { label: string; badge: string }> = {
  outlook: { label: "Microsoft Outlook", badge: "Outlook" },
  gmail: { label: "Google Gmail", badge: "Gmail" },
  imap: { label: "IMAP", badge: "IMAP" },
};

export const getMailbox = (id: string): Mailbox | undefined => MAILBOXES.find((m) => m.id === id);
export const defaultMailbox = (): Mailbox => MAILBOXES.find((m) => m.isDefault) ?? MAILBOXES[0];
