/*
 * auth.ts — Auth.js (NextAuth v5) config, dormant until AUTH_ENABLED=1 (L0.1).
 * Providers are built conditionally from env so the keyless demo (no OAuth
 * clients, no AUTH_SECRET) can import this module with zero side effects.
 * The sign-in grant DOUBLES as the ING mail consent (docs/GO_LIVE_PLAN.md):
 * the same OAuth grant that logs RD in carries the read-mail scopes and the
 * refresh token the ingest connector will use — login and ING-1 are one build.
 */
import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";

const providers: Provider[] = [];

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      // offline_access + Mail.Read: the refresh token minted at sign-in is
      // what the Graph mail ingest reads with — no second consent screen.
      authorization: { params: { scope: "openid profile email offline_access Mail.Read" } },
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google only issues a refresh token on an offline + consent grant;
      // gmail.readonly here makes sign-in double as the Gmail ingest consent.
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  );
}

// ALLOWED_EMAILS: comma-separated allowlist (RD, later the Mayor),
// case-insensitive. Unset or empty denies everyone — fail closed.
function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" }, // no adapter; the session lives in the cookie
  callbacks: {
    // Authn is the provider's job; authz is ONLY the allowlist.
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      return !!email && allowedEmails().has(email);
    },
    // account is only present on first sign-in: persist the refresh token +
    // provider so the mail ingest can be wired without another grant.
    jwt({ token, account }) {
      if (account) {
        token.provider = account.provider;
        if (account.refresh_token) token.refresh_token = account.refresh_token;
        // ── connector capture (ING-1) — begin marked block ──────────────────
        // Live path only (DATABASE_URL set): upsert the refresh token into
        // pipeline.connector_accounts so the ingest cron can pull mail. status
        // stays 'pending' — an operator flips it to 'active'. Fire-and-forget:
        // a DB outage must never block or fail the sign-in. Dynamic import
        // keeps this module side-effect-free for the keyless demo.
        if (account.refresh_token && process.env.DATABASE_URL) {
          const provider =
            account.provider === "google" ? "gmail"
            : account.provider === "microsoft-entra-id" ? "outlook"
            : null;
          const address = token.email?.toLowerCase();
          if (provider && address) {
            const refreshToken = account.refresh_token;
            import("./db")
              .then(({ query }) =>
                query(
                  `INSERT INTO pipeline.connector_accounts (provider, address, refresh_token)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (provider, address) DO UPDATE SET refresh_token = EXCLUDED.refresh_token`,
                  [provider, address, refreshToken],
                ),
              )
              .catch((err) =>
                console.error("[auth] connector capture failed:", err instanceof Error ? err.message : err),
              );
          }
        }
        // ── connector capture (ING-1) — end marked block ────────────────────
      }
      return token;
    },
  },
});
