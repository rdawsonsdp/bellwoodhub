# OAuth Setup — click-path runbook (L0.1 / ING-1 consent)

> RD's runbook for creating the two OAuth apps that back `web/lib/auth.ts`.
> Every env var name and callback path below is derived from that file:
> providers register only when their `AUTH_*` pair is set; provider ids are
> `microsoft-entra-id` and `google`, so the Auth.js v5 callback paths are
> `/api/auth/callback/microsoft-entra-id` and `/api/auth/callback/google`.
> The sign-in grant doubles as the mail-ingest consent (`Mail.Read` /
> `gmail.readonly` + refresh token) — do not trim the scopes.

The two base URLs used everywhere below:

| Environment | Base URL |
|---|---|
| Local dev | `http://localhost:3200` |
| Pilot (stable branch preview) | `https://bellwood-hub-pilot.vercel.app` |

---

## 1. Microsoft Entra app registration (portal.azure.com)

1. Sign in at **portal.azure.com** → search bar → **App registrations** →
   **+ New registration**.
2. **Name**: `Bellwood Hub Pilot`.
3. **Supported account types**: select **"Accounts in any organizational
   directory (Any Microsoft Entra ID tenant — Multitenant) and personal
   Microsoft accounts (e.g. Skype, Xbox)"**. This choice is load-bearing: it
   is what makes the code's default issuer (`/common/`, step 9) valid.
4. **Redirect URI**: platform dropdown = **Web**, value =
   `http://localhost:3200/api/auth/callback/microsoft-entra-id`.
   (The registration form accepts only one URI; the second is added next.)
5. Click **Register**.
6. In the new app: left nav **Manage → Authentication** → under the **Web**
   platform click **Add URI** → paste
   `https://bellwood-hub-pilot.vercel.app/api/auth/callback/microsoft-entra-id`
   → **Save**.
7. **Manage → API permissions** → **+ Add a permission** → **Microsoft
   Graph** → **Delegated permissions** →
   - search `Mail.Read` → check **Mail.Read** (under *Mail*);
   - expand **OpenId permissions** → check **email**, **offline_access**,
     **openid**, **profile**;
   - click **Add permissions**. Leave the default **User.Read** in place.
   Do NOT click "Grant admin consent" here — consent is delegated at sign-in
   (see §4 for the village-tenant exception).
8. **Manage → Certificates & secrets** → **Client secrets** tab → **+ New
   client secret** → description `bellwood-hub-pilot`, expiry **12 months**
   (calendar-reminder the rotation) → **Add** → **copy the *Value* column
   immediately** — it is shown only this once, and the *Secret ID* column is
   NOT the secret.
9. Record the mapping:

   | Where in the portal | Env var |
   |---|---|
   | **Overview → Application (client) ID** | `AUTH_MICROSOFT_ENTRA_ID_ID` |
   | Client secret **Value** (step 8) | `AUTH_MICROSOFT_ENTRA_ID_SECRET` |
   | Issuer — **leave unset** | `AUTH_MICROSOFT_ENTRA_ID_ISSUER` |

   Issuer default-if-unset: `lib/auth.ts` passes the env var straight through,
   and `@auth/core`'s provider falls back to
   `https://login.microsoftonline.com/common/v2.0` — correct for the
   multitenant + personal audience chosen in step 3. Set the var only if the
   registration is later locked to one tenant
   (`https://login.microsoftonline.com/<Directory (tenant) ID>/v2.0`).

## 2. Google Cloud OAuth client (console.cloud.google.com)

1. Sign in at **console.cloud.google.com** → project picker (top bar) →
   **New project** → name `bellwood-hub-pilot` → **Create** → select it.
2. Enable the API: **APIs & Services → Library** → search **Gmail API** →
   open it → **Enable**.
3. Consent screen: **APIs & Services → OAuth consent screen** (the current
   console redirects this to **Google Auth Platform**; same thing) →
   **Get started** →
   - App name `Bellwood Hub Pilot`, user support email = rdawson@;
   - **Audience: External**;
   - contact email = rdawson@ → agree → **Create**.
4. Keep **Publishing status = Testing**. On the **Audience** page →
   **Test users → + Add users** → add `rdawson@strategicdataproducts.com`
   now, and later the Mayor's gmail address. Only listed test users can
   complete the OAuth flow while in Testing.
5. Scopes: **Data access** (older console: consent screen → **Scopes**) →
   **Add or remove scopes** → filter by *Gmail API* → check
   `https://www.googleapis.com/auth/gmail.readonly` (it appears under
   **Restricted scopes**) → **Update** → **Save**. In Testing this is a
   declaration of intent — the app can request the scope regardless — but it
   must be on record before any future verification.
6. Client: **APIs & Services → Credentials** (Google Auth Platform:
   **Clients**) → **+ Create credentials → OAuth client ID** →
   - Application type **Web application**, name `Bellwood Hub Pilot web`;
   - **Authorized redirect URIs** — add BOTH:
     - `http://localhost:3200/api/auth/callback/google`
     - `https://bellwood-hub-pilot.vercel.app/api/auth/callback/google`
   - JavaScript origins: not needed (server-side code flow) → **Create**.
7. Record the mapping:

   | Where in the console | Env var |
   |---|---|
   | OAuth client **Client ID** | `AUTH_GOOGLE_ID` |
   | OAuth client **Client secret** | `AUTH_GOOGLE_SECRET` |

8. Expect at first sign-in: a **"Google hasn't verified this app"**
   interstitial (Continue past it — test users are allowed through).

**Testing-mode token lifetime — plan for it.** `gmail.readonly` is a
**restricted** scope. Google's documented behavior for External apps in
Testing that request more than basic profile scopes is that **refresh tokens
expire after 7 days**, i.e. weekly re-consent (sign out / sign in) during the
pilot. Google has revised this policy text before — read the exact warning
the console shows on the Audience/publishing page when you set it up, and
believe that over this paragraph. Moving to **Production** later requires
Google's OAuth app verification, and restricted Gmail scopes additionally
require an independent security assessment (CASA) — a weeks-long process; the
pilot stays in Testing deliberately.

## 3. Remaining env vars and where everything goes

Generate the session secret once:

```sh
openssl rand -base64 32   # → AUTH_SECRET
```

| Var | Value |
|---|---|
| `AUTH_SECRET` | output of the command above |
| `AUTH_ENABLED` | `1` (middleware gate; anything else = auth fully dormant) |
| `ALLOWED_EMAILS` | comma-separated allowlist, e.g. `rdawson@strategicdataproducts.com` — case-insensitive; **unset/empty denies everyone** (fail closed) |

No `AUTH_URL` / `AUTH_TRUST_HOST` needed: Auth.js trusts the host
automatically on Vercel (`VERCEL` env) and in local dev (non-production
`NODE_ENV`).

Each of the eight vars (`AUTH_MICROSOFT_ENTRA_ID_ID`,
`AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
`AUTH_SECRET`, `AUTH_ENABLED`, `ALLOWED_EMAILS`, and `DATABASE_URL` from §5)
goes in TWO places:

1. **Vercel** — dashboard → **web** project → **Settings → Environment
   Variables** → **Add** → key + value → under *Environments* check
   **Preview only**, then in the branch selector pick **`live-pilot`**.
   Never add these to Production — prod stays the keyless demo.
   CLI equivalent from `web/`: `vercel env add <KEY> preview live-pilot`.
2. **`web/.env.local`** — for `localhost:3200`. Gitignored; confirm with
   `git check-ignore web/.env.local` before any commit.

## 4. Village-tenant admin consent (the Mayor's Outlook, later)

If the Mayor's mailbox lives in a village Microsoft 365 tenant where IT has
**disabled user consent**, his delegated sign-in will be blocked with a
"Need admin approval" screen until village IT grants admin consent to this
app's client ID. It does not affect RD's pilot; handle it before the Mayor's
first sign-in. Email to forward to village IT:

> Subject: Admin consent request — Bellwood Hub Pilot (read-only mail access)
>
> We are piloting an application ("Bellwood Hub Pilot", Application/client ID:
> `<AUTH_MICROSOFT_ENTRA_ID_ID>`) that lets Mayor Bellwood sign in with his
> village Microsoft 365 account and grants the app read-only access to his
> own mailbox. The app requests only delegated Microsoft Graph permissions —
> Mail.Read, openid, profile, email, offline_access — no application-level
> permissions, no write or send access, and no access to any other user's
> mailbox. Because user consent appears to be disabled in the tenant, could
> you grant tenant admin consent to this application? In the Entra admin
> center: Enterprise applications → find the app by the client ID above (or
> Identity → Applications → Admin consent requests, if approval workflow is
> on) → Permissions → "Grant admin consent". Happy to walk through it or
> provide the full app registration details.

## 5. Final checklist — credential → env var

| # | Credential (where it comes from) | Env var |
|---|---|---|
| 1 | Entra **Overview → Application (client) ID** | `AUTH_MICROSOFT_ENTRA_ID_ID` |
| 2 | Entra client secret **Value** (copied at creation) | `AUTH_MICROSOFT_ENTRA_ID_SECRET` |
| 3 | *(leave unset — defaults to `/common/v2.0`)* | `AUTH_MICROSOFT_ENTRA_ID_ISSUER` |
| 4 | Google OAuth client **Client ID** | `AUTH_GOOGLE_ID` |
| 5 | Google OAuth client **Client secret** | `AUTH_GOOGLE_SECRET` |
| 6 | `openssl rand -base64 32` | `AUTH_SECRET` |
| 7 | literal `1` | `AUTH_ENABLED` |
| 8 | `rdawson@strategicdataproducts.com` (comma-append the Mayor later) | `ALLOWED_EMAILS` |
| 9 | Supabase connection string (below) | `DATABASE_URL` |

`DATABASE_URL`: Supabase dashboard → project **bellwood-mayor** →
**Settings → Database** → reset/reveal the database password → copy the
**Session pooler** connection string (the IPv4 one — the direct `db.<ref>`
host is IPv6-only and unreachable from Vercel) → substitute the password in.

Done when: both URIs registered on both providers, all nine vars present in
Vercel (Preview, branch `live-pilot`) and `web/.env.local`, and a logged-out
hit on either base URL bounces to sign-in.
