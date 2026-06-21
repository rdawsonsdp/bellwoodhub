# Village Knowledge AI Hub

A polished web front end for the Bellwood municipal email RAG store — the
**implementation of the `Village Knowledge AI Hub.dc.html` Claude Design
prototype**, wired live to the Supabase + pgvector backend in the parent
directory (`../`).

Staff type a plain-English question and get a **grounded, cited answer**
synthesized from the village's entire email + daily-report archive (≈20,000
synthetic messages), with every claim traceable to its source.

> All data is synthetic. Every row is `is_synthetic = true`; no real personal data.

## What's here

Three screens, faithful to the Claude Design prototype (navy `#0b2e63` / gold
`#e3a92c`, Sora + Inter, Material Symbols):

1. **Ask** — search box, Refine filters (person / address / dates / topic), the 7
   demo questions as chips, and results with a **Stacked / Split / Focus** layout
   switcher. Grounded answers render inline `[n]` citations that scroll to the
   matching source card; the last paragraph of a RAG answer is the
   **Recommended next step**. Aggregate questions ("what's still open", "who
   emails me the most") render their own views. A gold **auto-filter** note shows
   when a known person/street was detected (with *clear* to broaden).
2. **Property / Person** — the single-pane-of-glass: an entity's full timeline
   across every source stream, with a "Summarize & suggest next action" button
   that runs a grounded synthesis.
3. **Dashboard** — top constituents, most-active internal senders, what's still
   open, and message-volume / by-stream / by-topic breakdowns.

## How it's wired (everything is live)

The scripted `village-data.js` from the prototype is **not** used for content —
only its TOPICS/STREAMS palette and chip labels were ported (`lib/design.ts`).
All answers, sources, timelines and aggregates are fetched live:

- `lib/retrieval.ts` mirrors the Python `query.py`: embed the question
  (`text-embedding-3-small`), kNN over `poc.email_chunks`, optional
  person/address/date/topic filters via `poc.email_entities`, newest-first
  synthesis with `gpt-4o-mini`, and the same auto-filter / aggregate logic.
- **Cross-reference questions** (e.g. the St. Charles Rd bars) use *exact
  federated retrieval* — top matches **per source stream** via a window function
  — so police + fire + resident + business + code all surface in one answer
  instead of the police blotter dominating. Every row is a real top match in its
  stream; nothing is invented.
- API routes (`app/api/ask`, `app/api/entity`, `app/api/dashboard`) keep the DB
  and OpenAI keys server-side.

## Run it

```bash
cd web
cp .env.example .env.local       # DATABASE_URL + OPENAI_API_KEY (same as ../.env)
npm install
npm run dev                      # http://localhost:3000
# or: npm run build && npm run start
```

`.env.local` mirrors the Python pipeline's `.env`, so the app reads the same
populated `poc` schema. The Supabase migration + corpus must already be loaded
(see `../README.md`).

## Stack

Next.js 14 (App Router) · TypeScript · `pg` + pgvector · OpenAI · inline-styled
React components (no CSS framework) matching the design tokens. Fonts (Inter,
Sora, Material Symbols Rounded) load from Google Fonts.
