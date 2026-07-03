# Records Retention Policy — Bellwood Hub — **DRAFT**

> **DRAFT — NOT ADOPTED. FOR COUNSEL REVIEW.** Prepared 2026-07-03 by the
> Bellwood Hub project team for the Village Attorney ahead of the Tuesday
> (2026-07-07) go-live on the Mayor's production accounts. The project team
> drafts and describes what the system does; **counsel adopts** (with Local
> Records Commission approval where the Act requires it). Nothing here is
> operative policy or legal advice until counsel signs off. Until adoption,
> the system default in §4 (retain everything, no automated disposal) stands.

## 1. Scope

This draft covers all data ingested into Bellwood Hub (Supabase project
`bellwood-mayor` + the `live-pilot` Vercel environment) from:

- the Mayor's **government mailbox and calendar** (Microsoft 365 — connects
  Tuesday, with consent);
- the Mayor's **private/business Gmail account** (walled at ingest per DEC-6
  — see §5);
- the **pilot-rehearsal data** from RD's Google account (Gmail +
  Google Calendar, read-only), used to rehearse the process before the
  Mayor's accounts connect.

"Data" means the records themselves and their derivatives: raw provider
payloads (RAW landing), normalized envelopes (`canonical.messages`),
calendar events, attachment metadata, extracted entities/topics, embedding
chunks, and the append-only audit ledger (`app.audit_log`). The public demo
(synthetic data only) is out of scope.

## 2. Illinois legal frame

### 2.1 Local Records Act (50 ILCS 205)

Public records of local government agencies may not be destroyed without the
approval of the appropriate Local Records Commission, obtained through an
approved **Application for Destruction of Local Records** (records
disposal certificate under an approved schedule). For the Village of
Bellwood that body is the **Local Records Commission of Cook County**
(counsel to confirm). Practical consequence for the hub: **no disposal of
anything that is or may be a public record — automated or manual — until
counsel obtains or maps the hub onto an approved schedule.** The system
default (§4) is built to make that the path of least resistance.

### 2.2 FOIA (5 ILCS 140)

The hub is a **searchable copy of public records**. Records reachable in the
hub are presumptively as responsive to a FOIA request as the originals in
the mailbox; counsel should treat the hub as a second location to consider
in FOIA responses and litigation holds. Two implications cut in the
Village's favor: (a) the hub's search and audit ledger can make FOIA
response *faster and more demonstrable* (what was searched, by whom, when);
(b) because provider-side deletes do not propagate (§3), the hub may retain
responsive copies that no longer exist at the source. Counsel to advise on
how the hub enters the Village's FOIA response procedure and who its
records custodian is (Village Clerk?).

### 2.3 Copies vs. system of record

**The hub holds COPIES. The provider mailbox/calendar remains the system of
record.** The hub never writes back to the provider (read-only scopes; no
send or write scope exists on any connector), so nothing the hub does can
alter or destroy an original. Open question for counsel: whether hub copies
are *themselves* "public records" under the Act's broad definition (records
"made, produced, executed or received" by the agency) — which would mean
even disposing of hub copies requires Commission approval, including at a
pilot teardown. This draft assumes yes until counsel says otherwise.

## 3. System posture (supports whatever schedule counsel adopts)

The hub is engineered so that *retention is the default and disposal is a
deliberate act*:

| Posture | Mechanism |
|---|---|
| **Append-only canonical store** | Application code contains **no delete path** for canonical records. Nothing in the UI or API can destroy an ingested message or event. |
| **Provider deletes/moves do not propagate** | Sync treats canonical as a record, not a mirror (EMAIL_INGESTION.md §6) — an item deleted at the source persists in the hub. |
| **Immutable, versioned RAW landing** | Raw provider payloads are landed versioned and checksummed; re-ingestion creates versions, never overwrites. Supports full replay and verification. |
| **Append-only audit ledger** | `app.audit_log` records every query, open, decision, and ingest run; UPDATE/DELETE revoked from all roles and enforced by a database trigger guard even against the table-owning service role (migration 009). |
| **Disposal = deliberate DB operation** | When counsel adopts a schedule, disposal would be a documented, operator-executed database operation, leaving an audit row recording who, what, when, and the authorizing instrument (the approved Application number). No automated purge job exists or is planned for the pilot. |

## 4. Proposed default (pending counsel adoption)

1. **Retain all ingested records for the life of the pilot.**
2. **No automated disposal** of any kind — no TTLs, no purge jobs.
3. **Revisit at production cutover**: before the pilot becomes the
   production system, counsel maps hub holdings onto the Village's
   Commission-approved retention schedule and defines the disposal
   procedure (per §3, a documented manual operation with an audit row).
4. **Litigation holds override everything**: any hold counsel declares
   suspends even schedule-approved disposal (see §6.1).

## 5. Walled private-account data (DEC-6)

The Mayor's private/business Gmail is **walled at ingest**: excluded from
FOIA-indexed and default search, never surfaced on government screens. Its
contents are presumptively **not public records** — *except* that Illinois
authority holds communications about public business can be public records
regardless of the account they sit in (see *City of Champaign v. Madigan*
(Ill. App. 2013); counsel to advise on its application here). Pending
counsel guidance, walled data is retained under the **same no-auto-delete
posture** as everything else: the wall governs *visibility*, not
*retention*.

## 6. Open questions for counsel

1. **Litigation holds** — Who declares a hold, and how is it communicated to
   the operator? Today the no-delete default means a hold is effectively
   already in place; but once a disposal schedule is adopted, does the hub
   need an explicit hold flag that suspends disposal per record/thread? Must
   holds extend to vendor backups (§6.3)?
2. **The Mayor's personal Gmail duality** — The private account mixes
   personal matter with (potentially) public business. Does ingesting a
   public-business email from the private account into the hub change its
   record status or FOIA exposure? Should FOIA searches ever reach the
   walled store, and under whose authorization?
3. **Backup retention** — Supabase platform backups (daily / point-in-time)
   hold copies on the vendor's cycle; the Village cannot dispose of a record
   from a vendor backup on an arbitrary date. Counsel to confirm the adopted
   schedule tolerates the backup tail, and how holds interact with it.
4. **Are hub copies records?** — §2.3. Determines whether pilot teardown or
   any re-ingestion cleanup itself needs Commission approval.
5. **Custodianship** — Who is the records custodian for the hub, and how is
   it inventoried in the Village's records listings?

## 7. Adoption

Adopted by: ______________________ (Village Attorney) Date: ____________

Local Records Commission action (if required): ______________________

Until this block is executed, §4 is the operative default.
