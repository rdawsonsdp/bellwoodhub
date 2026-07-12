# Zero-Body Architecture — data custody redesign (DEC-14)

**Status:** decided 2026-07-12 (RD) · redesign tracked as **FEAT-25** (email, Z1–Z4) and
**FEAT-26** (Connector Gateway, deferred) on `PROJECT.md`
**Design sentence:** *Every record stays in its system of custody — Microsoft's government
cloud, Google, or inside the village firewall — and Bellwood Hub holds only the catalog.*

---

## 1. The problem

The Mayor's mailbox is ~85k messages. Today's pipeline lands that content **as full text in
four places** in the cloud DB:

1. `pipeline.raw_objects.payload` — the raw provider JSON
2. `pipeline.staged_messages.clean_body`
3. `canonical.messages.clean_body`
4. `canonical.chunks.chunk_text` — the text sits in the same row as its vector

A Supabase breach today yields the whole corpus in plaintext, four times over. As police,
fire, and council sources arrive, the same pattern would replicate their content too. The
goal, stated precisely: **never create a second, weaker full-text replica of any source
corpus.** Minimize blast radius; keep the mobile-first product fast.

## 2. Reframes that shaped the decision

- **The desktop is not the system of record for email.** `aharvey@vil.bellwood.il.us` is
  Exchange Online (the entire basis of MH-1: Entra registration, Graph delegated OAuth).
  The desktop Outlook is a cache of Microsoft's cloud. The hardened asset is the M365
  tenant. Desktop ingestion of email would be the *slow* path (Microsoft DC → village
  office internet → desktop → back out to Voyage/Supabase); cloud-to-cloud skips the
  office pipe twice, and the true backfill bottleneck (Graph throttling + Voyage embed
  throughput) doesn't care where the requester sits.
- **Storage topology never stops content transiting model providers.** Every embed pass
  sends text to Voyage; every Ask sends retrieved text to OpenAI. True in all designs;
  mitigated by zero-data-retention agreements, not architecture.
- **Vectors are not anonymous.** Embedding-inversion research recovers partial text; the
  index stays a sensitive asset in every design.
- **Per-mailbox nuance:** gov Outlook is FOIA-scoped public record; the walled Gmail is
  the truly private corpus. Zero-body treats both identically — the right default.

## 3. Options considered

| # | Option | Verdict |
|---|--------|---------|
| 1 | Desktop vault + cloud index | Rejected: mobile-first product (~80% phone, 7 AM digest) becomes hostage to a desktop's uptime; running an always-on reachable service *un-hardens* the workstation |
| 2 | Fully local on the desktop | Rejected: option 1's problems squared; business Gmail doesn't live there anyway |
| 3 | Hardened cloud (CMEK, private networking, Azure Gov) | Adopted as a **layer**, not the answer — raises the wall, doesn't shrink what's behind it |
| 4 | **Zero-body cloud (ephemeral hydration)** | **Selected** — zero new full-text copies beats one new copy on a machine we don't control |
| 5 | Tiered storage (bodies → KMS-encrypted S3 via `raw_ref`, per DEC-4) | Held as the optional performance cache under option 4 if hydration ever feels slow |

## 4. The selected design — Zero-Body Cloud

Microsoft and Google keep permanent custody of mail. Our cloud stores a derived index and
fetches bodies live, on demand, with the Mayor's own OAuth grant.

### 4.1 Stored vs. never persisted

| Stays in Supabase | Never persisted |
|---|---|
| Envelope: from/to/cc, subject, date, direction, thread, mailbox lane | `canonical.messages.clean_body` → **dropped** |
| `canonical.chunks`: embedding (1024-d) + token_count + offsets | `canonical.chunks.chunk_text` → **dropped** |
| Topics, entity graph, commitments, issue folds | `pipeline.staged_messages.clean_body` → **dropped** |
| `raw_ref` = provider pointer (Graph message id / Gmail id) + checksum | `pipeline.raw_objects.payload` → **checksum + pointer only** |
| Encrypted snippet (~200 chars, AES-GCM, key in Vercel env — never in the DB) | Attachments — never touch our storage |
| Agent outputs, drafts, Ask answers (bounded derived content, audited) | |

### 4.2 Write path — the 5-step contract becomes one streaming pass

`pull → land → normalize → canonicalize → embed` executes with the body only ever in
process memory: connector pulls → `cleanEmailText` → chunk → Voyage embed → write envelope
+ vectors + encrypted snippet → **discard the body**. The land step keeps its idempotency
role via checksum + `source_ref`, minus the payload. Re-embedding (FEAT-22) = re-pull from
the provider; the Sync page (FEAT-24) is the instrument for watching that.

### 4.3 Read path — one new module, five rewired call sites

New **`web/lib/hydrate.ts`**: `hydrateBodies(messageIds[])` → `raw_ref` → parallel
Graph/Gmail GET → `cleanEmailText` → short-lived in-memory LRU (minutes, never disk).
Wall-respecting (per-mailbox token), audited (`mail.hydrate` ledger rows), with a
DEMO_MODE stub over fixtures so the keyless path stays whole (non-negotiable).

Call sites (verified in code, 2026-07-12):

1. **Thread view** — `web/lib/retrieval-canonical.ts:195` (selects `clean_body`) →
   hydrate one thread. ~300–500 ms, then LRU-instant on revisit.
2. **Ask synthesis** — `web/lib/retrieval.ts` / `retrieval-canonical.ts:169` /
   `planner.ts:220` (chunk_text as context) → vector search returns ranked message ids
   exactly as today (**retrieval quality unchanged — vectors identical**), then hydrate
   top-K (~8–12) in parallel for synthesis context. Adds ~0.5–1 s to a multi-second
   operation. Side benefit: the synthesizer sees full fresh bodies, not stale chunks.
3. **Agent runner** — `web/lib/agent-runner.ts:152` (`LEFT(clean_body,400)`) → each run
   hydrates its bounded working set (same-thread + same-sender + semantic neighbors,
   already gathered). Crons unchanged.
4. **Inbox/Wall previews** — `web/lib/live-inbox.ts:43` → decrypt the stored snippet at
   the API layer. Lists stay instant; no fetch storm.
5. **7 AM digest** — agent output (derived), composed at run time. Unchanged.

**Performance:** Wall, digest, search lists, mobile first paint — structurally unchanged
(metadata-only queries). Drill-in +1 round trip. Ask +sub-second. Graph throttling
(~10k req/10 min per mailbox) is three orders of magnitude above our usage.

### 4.4 Residual risk, stated honestly

A total DB breach after this yields: envelope metadata (who/when/subject — accepted
plaintext tier, the Wall needs it), the entity/topic graph, vectors (partial inversion
academically possible — treat the DB as sensitive regardless), encrypted snippets
(unreadable without the separately-held key), and agent-written summaries.
**No message bodies. No attachments. Ever.**

**The crown jewel becomes the OAuth refresh tokens** (`web/lib/connectors/token-store.ts`)
— a breach capturing those can read the mailbox at the source. Hardening concentrates
there: AES-GCM app-layer encryption with the key outside the DB; scopes already trimmed
to least-privilege 7 (Mail.Read, no send); Sentinel alerting on anomalous access (proven
firing 2026-07-05); revocation drills. Plus **ZDR agreements** with Voyage/OpenAI/
Anthropic — content transits them at embed/ask time in every architecture; paper is the
control there.

**The kill switch is real:** the Mayor (or village IT) revokes consent in M365/Google →
tokens die → the hub can never read another body; what remains cannot reconstruct his
mail. This also materially helps LGL-1: the hub holds pointers, not records (counsel to
confirm).

## 5. Migration plan (FEAT-25, fits the 4-week roadmap)

- **Z1** (target wk of 2026-07-13, pairs with TASK-12 rotations): migration — write path
  stops persisting bodies; embed goes inline at ingest; encrypted-snippet column; token
  encryption at rest.
- **Z2:** `hydrate.ts` + rewire the five read paths + demo stubs. Eval: existing suites
  + a new **"no-plaintext" eval** asserting every body column is dropped/null across
  schemas (pipeline, canonical, poc).
- **Z3:** purge pass on already-mirrored corpora (null bodies, drop columns, vacuum) —
  pilot and Mayor DBs both. Anything mirrored under the current schema is cleaned here.
- **Z4:** counsel review (LGL-1) + a signed one-pager of the storage posture for village
  IT; Sentinel rules for `mail.hydrate` anomalies.

**Timing:** onboarding proceeds on the current schema (habit-building weeks W1–W2 matter;
the exposure window is bounded and Z3 purges it). **Gate W4 — "send goes live" — on
zero-body being done.** Security posture and autonomy rise together.

## 6. The Connector Gateway (FEAT-26, deferred)

**Principle: connectors run where the data lives.** The 5-step contract is identical
everywhere; what's *placeable* is where each connector executes.

- Cloud-native sources (Exchange Online, Gmail, Google Calendar) → cloud connectors,
  as today, under zero-body.
- On-prem sources (police RMS, fire/EMS, council docs, file shares) → a **gateway**
  inside the village firewall: a small, dedicated, always-on node (mini-PC or VM on an
  existing village/PD server), owned and hardened by the IT shop, running connector
  agents as a supervised service. **Explicitly not the Mayor's personal desktop** — an
  interactive workstation sleeps, gets patched/rebooted, and concentrates every
  credential on the single asset a targeted attacker goes after first.
- **Outbound-only.** The gateway dials out; nothing dials in. No open ports, no inbound
  rules, no tunnel exposing the network. The firewall posture is unchanged by our
  presence.
- The zero-body contract governs what crosses the firewall, per source sensitivity:

| Source | Lives | Connector runs | What leaves the firewall |
|---|---|---|---|
| Outlook (gov) | Exchange Online | Cloud | zero-body index only (already cloud data) |
| Gmail (walled) | Google cloud | Cloud | zero-body index only |
| Council minutes, permits | On-prem shares | Gateway | envelope + vectors + encrypted snippet; bodies stay home, hydrate through the gateway on drill-in |
| Fire/EMS | On-prem | Gateway | same, `internal` tier |
| Police / CJIS | On-prem RMS | Gateway | **possibly nothing content-derived at all** — metadata only, or a fully local index; CJIS policy decides, not us |

- For restricted sources, even embedding may run locally on the gateway (small on-node
  embedding model) rather than transiting Voyage — a per-source decision the gateway
  makes possible. Extends DEC-4's sensitivity routing from storage to *compute*.
- Sequencing: spec now (this doc), build when the first on-prem source arrives (likely
  council docs or fire, before police). Police/CJIS last, gated on a requirements
  conversation with whoever administers the village's LEADS/CJIS compliance.

## 7. What we tell the Mayor (FEAT-20 register)

> **"Your emails never move. We built a card catalog, not a copy."**
>
> Your email lives where it lives today — Microsoft's government cloud and Google. We
> don't make a copy of it, ever. What the hub keeps is a card catalog: who wrote to you,
> when, what it's about, and a mathematical fingerprint that lets us search — not the
> letters themselves.
>
> When you tap an email in the hub, it fetches it live from Microsoft at that moment,
> using the permission you granted — exactly the way the Outlook app on your phone does.
> Close it, and the hub doesn't keep it.
>
> If you ever want out, you flip one switch — revoke the hub's access — and it goes
> dark. What's left behind couldn't reconstruct a single email.
>
> And if the worst happened and someone broke into our system, they'd get the card
> catalog — never the mail, never the attachments.
>
> Same rules as always: it drafts, you decide; nothing sends without your signature;
> every action it takes is on the ledger.

(Slots into `docs/MAYOR_ONBOARDING_OVERVIEW.md` as a "Where your email lives" section.)

## 8. Decisions

**Settled (RD, 2026-07-12):**
- Zero-body cloud is the redesign; desktop custody rejected for email.
- Email/Gmail/calendar stay **cloud-ingested** (Exchange Online reality; latency favors it).
- Gateway is the pattern for future on-prem sources; build deferred until they ramp.
- Onboarding proceeds on current schema; Z3 purges; W4 send gate = zero-body done.

**Open:**
- (a) Snippet tier: 200-char encrypted previews (recommended) vs. no stored snippets
  (purer; list views then need per-row fetches).
- (c) Confirm Z1 start week of 2026-07-13 alongside TASK-12 rotations.
- (d) Gateway host: village server VM vs. dedicated mini-PC; which IT-shop owner.
- (e) Restricted-source vectors in the cloud index vs. gateway-local index (federated
  search) — decide with the CJIS conversation.
- ZDR agreements with Voyage/OpenAI/Anthropic — confirm/execute (new task).

## 9. Verification

- New eval: **no-plaintext** — walks `information_schema` and asserts body/payload
  columns are absent or all-null in `pipeline`, `canonical`, and `poc`.
- Existing 6 suites stay green through Z1–Z3; Ask day-two quality check post-Z2
  (retrieval unchanged by construction; synthesis context should *improve*).
- DEMO_MODE parity: every hydration call site has a fixture stub; `/chief` → 200 keyless.
- Supabase advisor + RLS checks re-run after column drops.
