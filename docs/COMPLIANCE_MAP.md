# Compliance Map — Bellwood Hub Pilot (for IT audit review)

> Prepared 2026-07-03 for the Tuesday auditor session. Scope: the **live pilot**
> (Supabase project `bellwood-mayor` + Vercel project `web`, Preview/`live-pilot`
> environment). The public demo (bellwood-hub.vercel.app) holds **synthetic data
> only** and is out of scope for data-protection review.
>
> Frameworks used: **CIS Controls v8** (the common municipal baseline via
> MS-ISAC/SLTT programs), **NIST SP 800-53 rev5 / CSF 2.0** references, with
> notes for **CJIS Security Policy** and Illinois statutes (FOIA 5 ILCS 140,
> Local Records Act 50 ILCS 205, PIPA 815 ILCS 530) where they apply.
> Every row carries the evidence an auditor can check live.

## Summary judgment

The pilot's **database isolation and platform configuration meet or exceed the
typical municipal (CIS IG1/IG2-level) baseline for a pre-production pilot**:
dedicated single-tenant database instance, default-deny row security verified
by automated scan, append-only audit ledger, encrypted transport and storage,
secret-gated machine endpoints, SSO-walled non-production environment, and
SOC 2 Type II / ISO 27001-attested vendors. **Known gaps are enumerated in
§5 with owners and phases** — none permit anonymous access to real data today.

---

## 1. Database isolation (Supabase `bellwood-mayor`)

| # | Control implemented | Standard mapping | Evidence |
|---|---|---|---|
| 1.1 | **Dedicated, single-purpose database instance** for the Mayor's real mail — a separate Supabase project (own Postgres instance, own credentials, own API keys). Synthetic/demo data lives in a *different project entirely*; no shared tables, roles, or keys (project decision DEC-9: one isolated DB per customer, no commingling) | CIS 3.12 (segment data processing by sensitivity) · NIST SC-7, AC-4 · CSF PR.IR-01 | Supabase dashboard: two distinct projects; `bellwood-mayor` ref `nxumwxzmnvjmeexknhde`, created 2026-07-03, us-east-1 |
| 1.2 | **Default-deny row-level security**: RLS enabled on all 25 project tables with **zero permissive policies**; `anon` and `authenticated` API roles have ALL privileges revoked across all four schemas (poc, canonical, pipeline, app). Only the service role (used solely by the application server) can read/write | CIS 3.3 (data access control), 6.8 (RBAC) · NIST AC-3, AC-6 (least privilege) · CSF PR.AA-05 | Supabase security advisor scan 2026-07-03: **zero "RLS disabled" findings**; only INFO-level "RLS enabled, no policy" — which *is* the deny-all posture. Re-runnable live in the dashboard (Advisors → Security) |
| 1.3 | **No anonymous data path**: the publishable (anon) key yields no table access by grant revocation, independent of RLS | Defense-in-depth for 1.2 · NIST AC-6(1) | `REVOKE ALL ON ALL TABLES IN SCHEMA … FROM anon, authenticated` (migrations/003_rls.sql, applied) |
| 1.4 | **Encryption at rest** — AES-256 platform encryption on database volumes and backups (Supabase/AWS default) | CIS 3.11 · NIST SC-28 · CSF PR.DS-01 | Vendor attestation (SOC 2 Type II); Supabase security docs |
| 1.5 | **Encryption in transit** — TLS required for all database connections and API traffic | CIS 3.10 · NIST SC-8 · CSF PR.DS-02 | Supabase enforces SSL; app pool sets `ssl` on every connection (web/lib/db.ts). ⚠ see Gap 5.1 (certificate verification) |
| 1.6 | **Append-only audit ledger** — `app.audit_log` records every Ask query, message open, draft decision, agent run, and ingest run; UPDATE/DELETE revoked from all API roles including service_role | CIS 8.2, 8.5 · NIST AU-2, AU-9 · IL FOIA/OMA accountability; the "what did the AI see and do" record | migrations/004_audit.sql (applied); `logAudit()` call sites in web/app/api/* |
| 1.7 | **Credential custody** — mailbox OAuth refresh tokens stored service-role-only under deny-all RLS (`pipeline.connector_accounts`); mail scopes are **read-only forever** (Mail.Read / gmail.readonly); no send scope exists anywhere | NIST IA-5, AC-6 · CJIS-friendly least-privilege posture | migrations/006_connectors.sql (applied); scope strings in web/lib/auth.ts |
| 1.8 | **US data residency** — database in AWS us-east-1; compute functions in Vercel iad1 (both N. Virginia) | Municipal contracting norm; supports records-jurisdiction posture | Project metadata (region visible in both dashboards) |
| 1.9 | **Records-preservation posture** — canonical rows are never deleted; provider deletes/moves do not propagate; immutable RAW landing (versioned, checksummed) supports full replay | Supports IL Local Records Act 50 ILCS 205 (see Gap 5.5 for the formal schedule) · NIST AU-11 (partial) | pipeline/0002 design (raw_objects versioning); EMAIL_INGESTION.md §6 |

## 2. Platform configuration (Vercel project `web`)

| # | Control implemented | Standard mapping | Evidence |
|---|---|---|---|
| 2.1 | **Production / non-production separation** — Production env serves only synthetic data (`DEMO_MODE=1`, no real-DB URL); the pilot runs on the `live-pilot` branch in the Preview environment with its own, disjoint secret set | CIS 16.8 (separate prod/non-prod) · NIST SA-3(1), CM-2 | `vercel env ls` shows per-environment scoping; prod demo verified serving synthetic fixtures |
| 2.2 | **Perimeter authentication on the pilot** — Vercel Deployment Protection (SSO) fronts every pilot URL; unauthenticated requests are 302-redirected to Vercel login | CIS 6.3 · NIST AC-17 · CSF PR.AA | Verified 2026-07-03: `curl -I https://bellwood-hub-pilot.vercel.app/chief` → `302 location: vercel.com/sso-api…` |
| 2.3 | **Application login + allowlist (built, pending activation)** — Auth.js with Microsoft Entra ID + Google providers; fail-closed `ALLOWED_EMAILS` allowlist; middleware 401s APIs / redirects pages when enabled. Dormant until the OAuth apps are registered (RD action); **compensating control until then = 2.2** | CIS 6.1–6.3 · NIST AC-2, AC-3, IA-2 | web/lib/auth.ts, web/middleware.ts (fail-closed allowlist; no-op only while `AUTH_ENABLED` unset) |
| 2.4 | **Secrets management** — all keys live in Vercel encrypted environment variables (encrypted at rest) or gitignored local env files; none in the repository or code | NIST IA-5(7) (no embedded secrets) · CIS 16 app-sec hygiene | `git check-ignore web/.env.local .env` passes; repo grep clean; `vercel env ls` shows Encrypted |
| 2.5 | **Machine endpoints token-gated** — scheduled jobs require `CRON_SECRET` (set on Production + Preview 2026-07-03); the MCP/agent endpoint requires `MCP_SECRET` on the pilot (closed its open-if-unset default) | NIST AC-3, IA-9 (service authN) · CIS 4 secure configuration | Route guards in web/app/api/cron/*, api/[transport]; unauthenticated call → 401 |
| 2.6 | **TLS everywhere** — HTTPS enforced with platform-managed, auto-renewed certificates on every domain | CIS 3.10 · NIST SC-8, SC-13 | All *.vercel.app domains; HSTS by platform |
| 2.7 | **DDoS baseline** — platform-level DDoS mitigation on by default; WAF available if needed | NIST SC-5 | Vercel platform security docs |
| 2.8 | **Action-level audit** — every API action on the pilot writes to the isolated database's append-only ledger (see 1.6) | CIS 8.2 · NIST AU-2 | Same as 1.6 |
| 2.9 | **Vendor assurance** — Vercel: SOC 2 Type II (Security, Confidentiality, Availability) + ISO 27001; Supabase: SOC 2 Type II + HIPAA-capable (BAA program), annual re-audit. Reports available via each vendor's trust center for procurement files | CIS 15 (service provider management) · NIST SA-9 · CSF GV.SC | security.vercel.com · supabase.com/security (verified 2026-07-03) |

## 3. Data-governance rules already in the design

- **Public-record / private wall (DEC-6):** the government mailbox is FOIA-scoped; the private mailbox is walled at ingest — excluded from default search and government surfaces. Enforced in providers and proven by automated tests.
- **AI exposure minimized in week 1:** the load pipeline makes **zero third-party AI calls** — the Mayor's mail touches only Microsoft/Google APIs and the isolated database. Embedding/model use is a deliberate, documented week-2 decision.
- **CJIS:** no criminal-justice information is ingested in the pilot. The police-records connector remains design-gated (the Police agent is observe-only by hard rule) until a CJIS-appropriate handling design (FIPS-validated crypto, personnel screening) exists.

## 4. What the auditor can verify live (10 minutes)

1. Supabase → bellwood-mayor → **Advisors → Security**: zero RLS-disabled findings.
2. `curl -I https://bellwood-hub-pilot.vercel.app/chief` → 302 to Vercel SSO (perimeter auth).
3. `curl https://bellwood-hub-pilot.vercel.app/api/cron/ingest-email` → 401 (machine endpoint gated).
4. Vercel → Settings → Environment Variables: secrets Encrypted, scoped per environment.
5. GitHub repo search for any key/secret string → none (all env-injected).
6. SQL (dashboard): `SELECT relname, relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE nspname IN ('poc','canonical','pipeline','app') AND relkind='r';` → `relrowsecurity = true` on every row.

## 5. Known gaps — register (honesty beats scorecards)

| # | Gap | Risk | Remediation | When |
|---|---|---|---|---|
| 5.1 | DB client TLS does not verify the server certificate (`rejectUnauthorized: false` in web/lib/db.ts) — encrypted but MITM-theoretic | Low (TLS still on; attacker needs network position) | Pin the Supabase CA cert in the pool config | L1.2, before Mayor's mail |
| 5.2 | App-layer login dormant until the two OAuth apps are registered | Mitigated by Vercel SSO perimeter (2.2) | RD registers Entra + Google apps (docs/OAUTH_SETUP.md); set `AUTH_ENABLED=1` | This weekend |
| 5.3 | OAuth refresh tokens in a locked DB table rather than a managed vault | Low (service-role-only, RLS, encrypted at rest) | Supabase Vault migration | EMAIL_INGESTION §8.5, week 2+ |
| 5.4 | No centralized log drain / alerting yet (cron failures could go quiet) | Medium for operations, low for data | Vercel Log Drains + alerts (dashboard toggle) | L0 ops item, RD dashboard access |
| 5.5 | No formal records-retention schedule adopted for the hub | Legal/records, not technical | Counsel review (LGL-1) — flagged before the Mayor's real mail connects | Before Tuesday's mayor-account consent |
| 5.6 | `app.audit_log` append-only is enforced by revokes + convention; the table owner could technically modify rows | Low; standard for single-operator pilots | DB trigger guard or export-to-WORM if auditor requires | On auditor request |
| 5.7 | App-level MFA not implemented; relies on the identity providers' MFA (Microsoft/Google/Vercel accounts) | Standard SaaS posture | Enforce MFA on the Microsoft/Google accounts used (policy, not code) | Policy note for Tuesday |
| 5.8 | Vercel project not yet git-connected (deploys are CLI-driven) | Process/change-mgmt | Connect GitHub in dashboard → PR-based deploys with preview review | Week 2 |

## 6. One-line answers for the two headline questions

- **"Does the database isolation meet municipal standards?"** Yes — instance-level isolation (dedicated project) + default-deny row security + revoked anonymous roles is *stronger* than the shared-database-with-policies pattern most municipal SaaS runs on, and it's verified by an automated advisor scan with zero findings.
- **"Does the Vercel configuration meet standards?"** Yes for a pilot — environment separation, encrypted secrets, SSO-walled non-production, token-gated machine endpoints, TLS everywhere, SOC 2/ISO 27001 vendors — with the §5 register naming exactly what's left (primarily: activate app login, cert pinning, log alerting, retention schedule).
