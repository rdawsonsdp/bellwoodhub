/*
 * demo.ts — keyless DEMO_MODE fixtures for the triage list. Renders the Needs
 * You screen with no DB and no API keys (house convention). Includes at least
 * one item per bucket and one item with two fired signals, so ranking and
 * reason-templating are visible without a live pass.
 */
import type { TriageView } from "./read";

export const DEMO_TRIAGE: TriageView = {
  needsReply: [
    {
      messageId: "demo-1", subject: "Re: FOIA request 2026-114 — records still outstanding",
      fromName: "Dana Whitfield", fromEmail: "dwhitfield@press.example.com",
      sentAt: "2026-07-19T14:02:00Z", bucket: "needs_reply", rank: 1, score: 150,
      // two fired signals — deadline within 48h + repeat follow-up
      reason: "Deadline Thursday, Jul 23; they've followed up more than once.",
      correction: null,
    },
    {
      messageId: "demo-2", subject: "Water main on Bohland — resident asking for an update",
      fromName: "Councilman Welch", fromEmail: "welch@villageofbellwood.gov",
      sentAt: "2026-07-16T09:10:00Z", bucket: "needs_reply", rank: 2, score: 42,
      reason: "Councilman Welch is waiting on you; no reply in 3 days.",
      correction: null,
    },
    {
      messageId: "demo-3", subject: "Following up — vendor invoice approval",
      fromName: "Maria Ortiz", fromEmail: "maria@acmesupplies.example.com",
      sentAt: "2026-07-17T16:40:00Z", bucket: "needs_reply", rank: 3, score: 52,
      reason: "They've followed up.",
      correction: null,
    },
  ],
  awaitingOthers: [
    {
      messageId: "demo-4", subject: "Re: Budget figures for the Q3 board packet",
      fromName: "You", fromEmail: "mayor@villageofbellwood.gov",
      sentAt: "2026-07-18T11:00:00Z", bucket: "awaiting_others", rank: null, score: 0,
      reason: "", correction: null,
    },
  ],
  fyi: [
    {
      messageId: "demo-5", subject: "Your weekly Village digest",
      fromName: "Village News", fromEmail: "no-reply@news.villageofbellwood.gov",
      sentAt: "2026-07-19T06:00:00Z", bucket: "fyi", rank: null, score: 0,
      reason: "", correction: null,
    },
  ],
  classifiedAt: "2026-07-19T14:05:00Z",
};

export const DEMO_SENDERS = [
  { id: "s1", match: "@villageofbellwood.gov", label: "Village staff", seeded: true },
  { id: "s2", match: "welch@villageofbellwood.gov", label: "Councilman Welch", seeded: false },
  { id: "s3", match: "@cookcountyil.gov", label: "Cook County", seeded: true },
];
