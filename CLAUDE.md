# Bellwood Hub — working notes for Claude

The Mayor's AI Chief of Staff. Next.js App Router app in `web/`, Supabase
Postgres + pgvector. The thing we demo is a **keyless DEMO_MODE** build.

The "what & why" lives in `@docs/PRODUCT_SPEC.md` (short brief) and
`@docs/FEATURE_SUMMARY.md` (full). Live status/tasks are in `@PROJECT.md`.

## Project layout
- `web/app/` — App Router pages + `api/<x>/route.ts` (each branches `if (DEMO)`).
- `web/components/chief/` — UI. `MobileApp.tsx` (mobile), `ChiefApp.tsx` (desktop),
  `ResponsiveChief.tsx` (switch), `AdminPanel.tsx`, `AgentsPage.tsx`, `UploadSource.tsx`.
- `web/lib/` — `cos-design.ts` (tokens), `demo/` (keyless provider + `data/` fixtures),
  `mailboxes.ts`, `source-types.ts`, `types.ts`, `screens.ts`.
- `app/globals.css` — CSS-var themes + keyframes. Repo root: `PROJECT.md`, `docs/`.
- New API route → follow `web/app/api/inbox/route.ts`. New screen → follow the
  existing screens in `MobileApp.tsx` / `ChiefApp.tsx`.

## Do / Don't
- **Do** typecheck + build (from `web/`) before every deploy; verify `/chief` → 200 after.
- **Do** give every new feature a DEMO_MODE path, on **both** mobile and desktop.
- **Do** run `git check-ignore web/.env.local .env` before committing.
- **Don't** commit secrets, or trim `search-index.json` (it's bundled via tracing).
- **Don't** commit/push/deploy unless asked. "Push" = git **and** Vercel.
- **Don't** put business (Gmail) mail in FOIA-indexed/default search — it's walled.

## Commands (run from `web/`)
- Dev: `npm run dev` (port 3200). If it 500s between sessions, kill the port and restart.
- Typecheck: `npx tsc --noEmit`  ·  Build: `npm run build`
- **Always typecheck + build before deploying.**
- Deploy: `vercel --prod --yes` from `web/`. Prod URL: https://web-seven-tawny-20.vercel.app
  (alias bellwoodhub.vercel.app hits Vercel SSO — use the tawny URL). Verify `/chief` → 200 after.

## Non-negotiables
- **Everything must work in DEMO_MODE** (no DB, no keys). `DEMO = !process.env.DATABASE_URL || DEMO_MODE==="1"`.
  API routes branch `if (DEMO) return demoX()`. Demo data lives in `web/lib/demo/` (provider `index.ts`,
  fixtures in `data/`). Any new feature needs a demo path or it's blank for the mayor.
- **Mobile + desktop are separate components** — `MobileApp.tsx` (≤768px) and `ChiefApp.tsx` (desktop),
  switched by `ResponsiveChief`. When you change a feature, do it in BOTH or they drift (they have before).
  ~80% of use is mobile; lead there.
- **Secrets**: keys live only in gitignored `.env` / `web/.env.local` (OPENAI/Voyage/DB also in Vercel env).
  Run `git check-ignore web/.env.local .env` before any commit. Never commit secrets.
- **Branch/commit/push only when asked.** When asked to "push," push to git AND deploy to Vercel.

## House style
- React with **inline styles + design tokens** from `lib/cos-design` (`C`, `FONT`). No CSS modules.
- Theming via CSS variables with an `--ink` overlay channel; 4 schemes; keyframes go in `app/globals.css`.
- Match the surrounding file's idiom and comment density.

## Verification reality
- I can't screenshot mobile (the tool renders desktop width). Verify behavior with **live API curls + a
  clean production build**; the user confirms look-and-feel on their phone. Say so honestly.

## Data model (canonical)
`canonical.messages` (Envelope) · `entity_aliases` (reversible identity ledger) · `edges` (graph) ·
`message_topics` · `chunks` (Voyage 1024-d). Streams are computed read-time from topic + sender domain.
Ingestion = one 5-step Connector contract (pull→land→normalize→canonicalize→embed). **Mailbox** is the
filterable "source system" (gov Outlook = public/FOIA; business Gmail = walled/private). Search spans the
whole corpus (email + documents), not just mail.

## Gotchas (learned the hard way)
- `tsc`/`npm` must run from `web/`, not repo root.
- iOS Safari `MediaRecorder` emits `audio/mp4`, not webm — set the upload filename ext from the real MIME.
- Whisper hallucinates ("thank you for watching") on silence — guard tiny clips + filter phrases.
- `search-index.json` is ~31MB — kept in the bundle via `next.config.mjs outputFileTracingIncludes`, don't trim.
- Supabase: use the **Session Pooler** host (IPv4); the direct `db.<ref>` host is IPv6-only.

## Project management
`PROJECT.md` at repo root is the PM source of truth (run by the project-manager skill). Log the *main*
updates as you work — judgment, not bookkeeping. `git push` triggers a pre-push hook that republishes the
status dashboard (project-status-ten.vercel.app).

## Persona (demo data is synthetic)
Mayor Merrill Bellwood, Village of Bellwood IL. Personal business = Harbor Wellness Dispensary, Cary IL
(walled Gmail). Graduated autonomy R1–R4: agents draft, the mayor decides; nothing sends without a human gate.

## Glossary
- **Envelope** — the normalized record every connector emits (→ `canonical.messages`).
- **Mailbox** — the filterable "source system" (gov Outlook vs. walled business Gmail); ≠ connector type.
- **Stream** — Police / Fire/EMS / Resident / … computed read-time from topic + sender domain.
- **Corpus** — emails **and** documents (fire/police/permits/minutes/FOIA); Ask searches all of it.
- **R1–R4** — autonomy ladder: read-only → suggest → draft (human-gated send) → proactive digests that state gaps.
