# Bellwood Municipal Email RAG POC

"Ask my email anything" — for a whole village hall. This proof-of-concept shows
how **every municipal email stream resolves into one RAG database**: constituent
mail, interdepartmental memos, **police daily incident reports**, and **fire/EMS
daily run reports** all land in the same `pgvector` store and answer
natural-language questions with **citations back to the source messages**.

It proves three things:

1. **Single view of a property / resident** — *"Pull up everything we know about
   2218 Bohland Ave"* / *"What's our history with Gloria Bennett?"*
2. **Interaction history + next best action** — *"How did this go, and how have
   we handled this kind of thing before?"*
3. **Cross-source resolution** — a Route 64 noise call shows up in the **police
   blotter**, the **resident complaint**, *and* **Code Enforcement's resolution**,
   and one question surfaces all of them.

> ⚠️ **All 20,000 emails are synthetic.** Real Bellwood, IL geography (streets,
> IDOT, Cook County, Metra, Taste of Bellwood); every person, address number,
> business, phone, and case number is invented. Every row is `is_synthetic =
> true`. No real personal data.

---

## The corpus (20,000 emails, 24 months)

A **10,000-email base** (`config.SOURCE_MIX`) plus a **10,000-email citizen-weighted
expansion** (`generate_addl.py`) that makes it a genuinely constituent-dominated
inbox. Actual mix after the expansion:

| Stream | ~count | Examples |
|--------|-------:|----------|
| Residents / constituents | ~12,100 | potholes, water bills, flooding, permits, thanks |
| Interdepartmental | ~2,800 | PW/Code/Water/Parks/Clerk/Finance memos & routing |
| Police daily reports | 750 | overnight incident summaries (blotter) |
| Fire / EMS daily reports | 650 | structure fires, EMS runs, alarms, storm pump-outs |
| Business / licensing | ~1,200 | signage, development, corridor, vendors |
| Civic / FOIA / regional | ~1,100 | council, FOIA, IDOT/County/Metra/District 209 |

Citizen requests are now **61% of the corpus** (up from 37% in the base 10k); 74%
of all mail is inbound.

On top of the volume sit the hand-built **showpieces**:

- **4 hero scenarios** — the 2218 Bohland Ave flooding saga (14-month arc), Gloria
  Bennett's 7-contact history ending in a recent unresolved item, the St.
  Charles Rd noise *precedent* (same operating-hours remedy at Route 64 → The
  Hideout → El Faro), and **Eleanor Meyer's basement-flooding saga** at 1733
  Frederick Ave (5 threads, Sep 2025 → Jun 2026, ending unresolved).
- **7 complex multi-party threads** — area-wide flooding emergency, a contested
  TIF development, a water-main break + boil order, a derelict-property legal
  escalation, a FOIA/overtime dispute, Taste of Bellwood planning, and an ADA
  curb-cut → CDBG capital project. Each is one long thread, 10–12 messages,
  5–11 participants, 150–400-word emails.

---

## Architecture (hybrid)

Two layers keep it realistic *and* reproducible at 10k scale:

1. **Authored content banks** (LLM agents, run once) — the hero + complex threads,
   the police/fire **incident-narrative banks**, and **slot-templated** email
   templates per department/topic. These live in `corpus/authored/` and
   `corpus/banks/`.
2. **Deterministic seeded generator** (`generate_corpus.py` + `synth.py`) —
   instantiates the slot templates with procedural pools (varied streets, names,
   dates, amounts, account/case numbers), composes the daily reports across the
   full date window, and assembles everything into the base 10,000 emails with
   real threading, signatures, legal disclaimers, and nested quoted reply chains.
3. **Additive citizen expansion** (`generate_addl.py`) — appends a second 10,000
   citizen-weighted batch (mostly standalone constituent requests + Mrs. Meyer's
   saga), reusing the same assembler. New `message_id`/`thread_id` are namespaced
   `a2-` so they can't collide; re-running *replaces* the batch (idempotent).

The committed **`corpus/seed_emails.json` is the canonical corpus** (now 20k:
base + additive) — loading it is fully reproducible (fixed seeds). `corpus/
seed_addl.json` holds the additive batch on its own; `corpus/seed_base_backup.json`
preserves the original 10k.

### What's in the box

| File | Purpose |
|------|---------|
| `config.py` | All knobs: corpus size, source mix, seed, model, window, demo questions. |
| `migrations/001_init_poc.sql` | `poc` schema, tables, pgvector, indexes. |
| `corpus/personas.py` | Recurring cast: residents, full city-department staff, report senders. |
| `corpus/pools.py` | Procedural pools (cast-free names, streets, businesses, dispositions). |
| `corpus/banks/` · `corpus/authored/` | LLM-authored templates, incident banks, hero & complex threads. |
| `synth.py` | Instantiates templates + composes police/fire daily reports. |
| `generate_corpus.py` | Assembles authored + procedural → `corpus/seed_emails.json`. |
| `generate_addl.py` | Appends a 10k citizen-weighted batch (Mrs. Meyer saga) → 20k. |
| `clean_text.py` | Strips signatures / disclaimers / quoted chains. |
| `load_embed.py` | Load → clean → chunk → embed → `poc.email_chunks` (batched). |
| `extract_entities.py` | Addresses / people / phones / businesses → `poc.email_entities`. |
| `query.py` | Retrieval CLI with auto entity-filtering, aggregates, `--demo`. |

### Data model (`poc` schema)

- **`poc.emails`** — direction, from/to/cc, subject, `date_sent`, `body_raw`
  (signature + disclaimer + quoted history), `body_clean` (stripped), `topic`
  (incl. `public_safety`, `fire_ems`), `is_synthetic`.
- **`poc.email_chunks`** — `body_clean` in ~300–500 token chunks, `vector(1536)`
  embedding, HNSW cosine index.
- **`poc.email_entities`** — normalized `address` / `person` / `phone` /
  `business`, propagated across each thread (an address/person lookup returns the
  whole conversation).

---

## Prerequisites

- The Supabase project **`emailagent`** (`rqbkxoniqmuyvvpjbegu`) with the
  migration applied.
- Python 3.9+, deps in `requirements.txt`.
- A `.env` (copy `.env.example`) with `OPENAI_API_KEY` (embeddings +
  grounded-answer model) and `DATABASE_URL` (Supabase Postgres URI — the Session
  pooler works from IPv4 networks).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill in OPENAI_API_KEY and DATABASE_URL
```

---

## Run order

```bash
# 1. (one-time) apply migrations/001_init_poc.sql (done on `emailagent`).

# 2. Generate the 10k base seed from the authored banks (deterministic; no DB/API key).
python generate_corpus.py

# 2b. (optional) Append the 10k citizen-weighted batch + Mrs. Meyer → 20k canonical seed.
python generate_addl.py

# 3. Load, clean, chunk, embed. Prints a cost estimate and PAUSES before spending.
#    Without --fresh it embeds only NEW chunks (so step 2b re-loads cheaply).
python load_embed.py --yes          # ~$0.02 per 10k of new chunks

# 4. Extract entities (rebuilds across the whole corpus; no API cost).
python extract_entities.py

# 5. Ask away.
python query.py --demo
```

Re-running is idempotent. `load_embed.py` without `--fresh` embeds only missing
chunks, so appending the additive batch only spends on the new records.

---

## The query CLI

```bash
python query.py "what's the full history on 2218 Bohland Ave?"
python query.py "history with Gloria Bennett and her latest email"   # auto-filters to her
python query.py "bar noise on St. Charles Rd" --since 2025-01-01
python query.py "drainage problems" --topic drainage --until 2026-06-01
python query.py --demo                                               # the 7 demo questions
python query.py "..." --answer                                       # grounded answer + [n] citations
```

- Returns top matching chunks with **score, direction, date, sender, subject,
  topic, snippet, and message-id** — every answer is traceable.
- **Auto entity-filtering:** a known constituent name (e.g. "Gloria Bennett") or
  a distinctive street (e.g. "Bohland Ave", "St. Charles Rd") in the question is
  auto-applied as a `--person` / `--address` filter (overridable).
- Manual filters: `--person`, `--address`, `--since`, `--until`, `--topic`.
- `--demo` runs grounded answers; two aggregate questions ("who emails me the
  most", "what's still open") use dedicated SQL.

---

## Demo script (the answer key)

1. **"Full history on 2218 Bohland Ave?"** → the 14-month flooding saga + the
   area-flooding thread + the storm-sewer inspection (auto-filters to Bohland Ave).
2. **"History with Gloria Bennett, and how to handle her latest email?"** → her
   7 contacts over two years ending in the recent unresolved storm-drain note
   (auto-filters to her; grounded answer flags the latest + a next step).
3. **"How have we handled noise complaints on St. Charles Road?"** → the same
   operating-hours remedy at Route 64 → The Hideout → El Faro (a real precedent).
4. **"What's still open right now?"** → recent unresolved inbound (aggregate).
5. **"Flooding and drainage this spring?"** → the spring-2026 drainage cluster
   (`--topic drainage --since 2026-03-01` tightens it).
6. **"Who has emailed me the most, and what about?"** → top constituents (Ray
   Delgado) *and* most-active internal senders (PD/Fire daily reports) — the
   unified inbox (aggregate).
7. **"Cross-reference police & fire reports with the St. Charles bar complaints."**
   → the blotter incidents + resident complaints + Code's resolution, across
   every source.
8. **"Eleanor Meyer's basement flooding at 1733 Frederick Ave — where do things
   stand?"** → her 5-thread saga (Sep 2025 → Jun 2026) ending unresolved
   (auto-filters to her *and* Frederick Ave; grounded answer + next step).

---

## Reproducibility & cost

- The committed `corpus/seed_emails.json` is canonical (20k); `generate_corpus.py`
  and `generate_addl.py` are deterministic given their seeds. Re-running the LLM
  authoring step would produce different prose, but the seed files are what the
  demo runs on.
- Embedding the full 20k corpus (~20.2k chunks, ~2M tokens) costs about **$0.04**
  with `text-embedding-3-small` (the additive 10k batch was ~$0.016); each query
  is a fraction of a cent.
