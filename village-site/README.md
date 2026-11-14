# Village of Bellwood website

The public website for the Village of Bellwood, Illinois: Next.js (App Router),
TypeScript, Tailwind, Supabase for content and files, Resend for email.

## Run it

```bash
npm install
npm run dev        # http://localhost:3300
npm run typecheck
npm run build
```

With no environment variables the site runs on sample content from
`lib/placeholder/` and logs emails instead of sending them. Copy
`.env.example` to `.env.local` to connect Supabase and Resend.

## How it is organized

- `app/[locale]/` — every public page, in English (plain URLs) and Spanish (`/es/...`)
- `app/admin/` — staff area behind Supabase login
- `app/api/` — form endpoints
- `components/` — layout, homepage sections, forms, UI pieces
- `lib/` — data access (`lib/data`), sample content (`lib/placeholder`), text (`lib/dictionaries`), menus (`lib/nav.ts`)
- `supabase/migrations/` — database tables and access rules
- `TODO-CONTENT.md` — everything that still needs real village data
