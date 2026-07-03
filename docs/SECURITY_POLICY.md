# Security Policy — Bellwood Hub

> The plain-English security policy for the live pilot (Supabase project
> `bellwood-mayor` + the `live-pilot` Vercel environment). Written for
> technical peers: a CTO should be able to read it in ten minutes and defend
> it to a board. The control-by-control evidence lives in
> `docs/COMPLIANCE_MAP.md`; the operational procedures in
> `docs/OPS_RUNBOOK.md`; the records posture in `docs/RETENTION_POLICY.md`.
> Owner: RD. Last revised 2026-07-03.

## 1. What this system is and what it holds

Bellwood Hub is the Mayor of Bellwood's AI chief of staff: a web application
that reads his government mailbox and calendar, organizes what it finds, and
lets a small set of AI agents draft responses that a human approves or
discards. It runs on Vercel (compute) and Supabase (Postgres database), both
in Northern Virginia. Two people use it — the operator (RD) during the pilot,
then the Mayor — from a predictable set of devices: a couple of phones and a
couple of desktops.

What it holds is real: copies of email and calendar data from the Mayor's
government Microsoft 365 account, and — walled off separately — his private
business Gmail. The word *copies* matters. The hub connects to the mail
providers with read-only credentials, pulls messages into its own isolated
database, and never writes anything back. The provider mailbox remains the
system of record; nothing the hub does can alter or destroy an original.

## 2. The threat we design against first

The number-one risk to this project is simple to state: **an attacker gets at
the Mayor's email through us.** Not a data-center fire, not an outage — a
breach of this application becoming a breach of the Mayor's correspondence.
Every design decision below is ranked against that scenario.

The key structural insight: **the app never holds the mailbox password, and
its credentials cannot manage the account.** Sign-in happens at Microsoft
and Google; what the hub keeps is an OAuth refresh token scoped to reading
mail (`Mail.Read` / `gmail.readonly`), reading the calendar
(`calendar.readonly`), and — added 2026-07-03 as a deliberate, separately
decided step — sending replies (`gmail.send`), which is **caged** (below).
No delete, write-to-mailbox, or account-management scope exists anywhere
(COMPLIANCE_MAP §1.7). Even a *total* compromise of the application —
attacker owns the server, reads every secret — cannot delete the Mayor's
mail, reset his password, or change his account in any way.

**The send cage.** Transmission is possible ONLY through one path: a human
pressing Approve on a specific draft. Behind that human gate sit two more
locks, both fail-closed: a master switch (`SEND_ENABLED` — anything but "1"
means nothing sends), and a **recipient allowlist** (`SAFE_SEND_ALLOWLIST`)
that ships holding only the operator's own address — so even a runaway
agent or a compromised approve path could, at worst, email the operator.
Widening the allowlist is an explicit, per-environment operator act. Every
attempt — sent, cage-refused, or provider-failed — lands in the audit
ledger with the outcome on the draft row. The residual worst case of a
total compromise is therefore: disclosure of the copies we hold, plus mail
sent to allowlisted addresses only. Every layer in the next section exists
to shrink the former; the allowlist bounds the latter.

## 3. Blast-radius layers

The architecture is a series of firewalls and breaks. Each paragraph states
what an attacker who has beaten the previous layer *still cannot do*.

**Perimeter.** Every pilot URL sits behind Vercel's platform SSO
(Deployment Protection): an unauthenticated request never reaches our code —
it gets a 302 to Vercel's login. An attacker scanning the internet finds a
locked door, not an application.

**Identity.** Past the perimeter, the application requires its own sign-in
via Microsoft or Google, authorized against a named-person allowlist
(`ALLOWED_EMAILS`). The allowlist fails closed: unset or empty means
*everyone* is denied, including us. An attacker with a valid Google account —
even a stolen one — gets a 403 unless that exact address was placed on the
list. (During the brief window before the OAuth apps are registered, the
SSO perimeter is the compensating control; see COMPLIANCE_MAP gap 5.2.)

**Application.** Every page and API route requires a session. The two
machine paths — scheduled jobs and the agent/MCP endpoint — do not ride on
user sessions at all; each requires its own secret (`CRON_SECRET`,
`MCP_SECRET`) and returns 401 without it. An attacker who phishes a user
session cannot invoke the machine endpoints, and an attacker who leaks a
machine secret gets no user surface.

**Database.** The data lives in a dedicated, single-tenant Supabase
instance — its own Postgres, its own credentials, no other customer's data
and no synthetic demo data commingled. Row-level security is enabled on
every table with zero permissive policies (deny-all), and the anonymous and
authenticated API roles have all privileges revoked. Only the application
server's service role can touch data. An attacker who obtains the public
API key gets nothing; there is no anonymous path to any row.

**Secrets.** No key lives in code or in the repository — all secrets sit in
platform-encrypted environment variables, scoped per environment. The mail
OAuth refresh tokens get stronger custody still: they live in Supabase
Vault, a managed secrets store whose encryption keys are held outside the
database itself. An attacker who exfiltrates a full database dump holds
ciphertext for the one credential that reaches the mailbox.

**Transport.** All traffic is TLS: HTTPS on every domain, and the
application verifies the database's certificate against the pinned Supabase
certificate authority — not just "some certificate," *that* certificate. An
attacker with network position cannot silently interpose on the
app-to-database link.

## 4. Watching actively

Layers slow an attacker down; watching is how we notice one. Three
mechanisms, all active today:

**The audit ledger.** Every read and every action — each Ask query, each
message opened, each draft approved or discarded, each agent and ingest
run — writes a row to `app.audit_log`, including who acted, from what IP
address, on what device, and from what city/region (captured from the
platform's request headers). The ledger is append-only and enforced at the
database: a trigger rejects UPDATE and DELETE for every role, *including*
the table owner. Neither an attacker nor an insider nor the application
itself can rewrite history.

**Hourly health checks.** The `ops-watch` endpoint runs on the hour and
probes the pipeline: database reachable, connectors syncing, nothing
dead-lettered. Anything wrong returns a 503 that an external uptime monitor
turns into an alert. A quiet failure — the classic way breaches go unnoticed
for months — is designed out.

**The Sentinel agent.** A dedicated monitoring agent whose only job is
comparing today's access pattern against the known baseline. Usage here is
unusually predictable — the operator's phone and desktop, later the Mayor's,
from known places at known hours — which makes deviation detection genuinely
tractable rather than security theater. A new device, an unfamiliar
location, an off-hours burst of reads: Sentinel remembers the baseline,
spots the deviation, and flags it for a human. It **flags, never blocks** —
usability is a design requirement (Section 5), and a false positive that
locks the Mayor out during a flood response is its own kind of incident.

## 5. Deliberate trade-offs

Security decisions we made on purpose, and what compensates:

- **No VPN or tunnel.** This is a mobile-first tool used from a phone in the
  field; a VPN requirement would kill daily use, and a tool nobody uses
  protects nothing. Compensation: the SSO perimeter, the fail-closed
  allowlist, and active monitoring (Section 4) — access is open to exactly
  the named people and watched for everyone.
- **MFA is delegated, not rebuilt.** We do not implement our own MFA; we
  rely on Microsoft, Google, and Vercel account MFA, which is stronger and
  better-maintained than anything we would write. Policy requirement: MFA
  **must** be enforced on every Microsoft, Google, and Vercel account with
  access to this system.
- **Vendor cloud, not on-prem.** Vercel and Supabase both carry SOC 2
  Type II attestations (Supabase additionally HIPAA-capable; Vercel also
  ISO 27001). Their platform security — patching, physical security,
  encryption at rest — exceeds what a village IT closet can sustain.
- **Zero third-party AI in the ingestion path (week 1).** The pipeline that
  pulls and stores the Mayor's mail makes no model calls at all: content
  touches Microsoft/Google APIs and our isolated database, and *zero* other
  parties. Introducing embedding/model calls is a separate, documented
  week-2 decision — not something that drifted in.

## 6. Governance

The hub is built for a government context, not retrofitted to one. Records
posture: canonical records are append-only — the application contains no
delete path, provider-side deletions do not propagate, and disposal (when it
ever happens) is a deliberate, documented operation under a retention
schedule that counsel adopts (`docs/RETENTION_POLICY.md`, drafted for the
Village Attorney; until adoption, the default is retain-everything).

A hard wall separates public-record and private accounts: the government
mailbox is FOIA-scoped; the private business Gmail is walled at ingest —
excluded from default and FOIA-indexed search and never surfaced on
government screens.

And because every read and action lands in the append-only ledger, the
system can answer — for any date, in minutes — the question a public body
must be able to answer about an AI system: *what did the system and its
agents see and do?*

## 7. Incident response, briefly

- **Detect** — a Sentinel deviation flag, an ops-watch 503, or an external
  monitor alert.
- **Contain** — revoke the OAuth grant at Microsoft/Google: one click at
  the provider kills the app's access to the mailbox entirely, because the
  refresh token is the only credential the app has. Then rotate secrets
  (`CRON_SECRET`, `MCP_SECRET`, database credentials) from the platform
  dashboards.
- **Assess** — reconstruct exactly what was accessed, by whom, from where,
  from the append-only ledger. The ledger cannot have been edited by the
  attacker (Section 4).
- **Notify** — if personal information was disclosed, notify per the
  Illinois Personal Information Protection Act (815 ILCS 530), with counsel
  driving scope and timing.

## 8. Review cadence and ownership

RD owns this policy. It is reviewed and re-signed at production cutover
(when the Mayor's accounts connect) and quarterly thereafter, and revised
immediately whenever a layer in Section 3 changes. The known-gaps register
in `docs/COMPLIANCE_MAP.md` §5 is the living companion: honesty beats
scorecards.

---

## Summary — what we do (one page)

- **No account control by construction**: the app never holds the mailbox
  password; its OAuth scopes cannot delete, modify, or manage the account.
  Sending exists but is **caged**: human Approve → master switch →
  recipient allowlist (ships as the operator's own address only) — every
  attempt audited, fail-closed at each lock.
- **SSO perimeter** in front of every non-production URL — unauthenticated
  requests never reach our code.
- **Named-person allowlist**, fail-closed: unset means everyone is denied.
- **Session required everywhere**; machine endpoints carry their own
  secrets and 401 without them.
- **Dedicated single-tenant database** with deny-all row security and no
  anonymous access path — verified by automated scan, zero findings.
- **Secrets platform-encrypted**; mailbox tokens in a managed vault with
  keys held outside the database.
- **TLS everywhere**, with the database certificate verified against the
  pinned Supabase CA.
- **Append-only audit ledger** of every read and action — with IP, device,
  and location — that even the table owner cannot rewrite.
- **Active watch**: hourly automated health checks plus the Sentinel agent
  comparing access against the known device/location baseline; deviations
  flag a human, never block a user.
- **One-click kill switch**: revoking the OAuth grant at the provider ends
  the app's mailbox access entirely; governance (retention with counsel,
  FOIA wall, PIPA notification) is designed in, not bolted on.
