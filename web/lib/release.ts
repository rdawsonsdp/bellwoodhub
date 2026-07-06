/*
 * release.ts — the deployed release's identity, client-safe. Inlined at build
 * from Vercel's git env (mapped in next.config.mjs), so what the UI shows is
 * BY CONSTRUCTION the commit Vercel built. Empty strings in local dev.
 */
const FULL_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA || "";

export const RELEASE_SHA = FULL_SHA.slice(0, 7);
export const RELEASE_REF = process.env.NEXT_PUBLIC_COMMIT_REF || "";
export const RELEASE_URL = FULL_SHA ? `https://github.com/rdawsonsdp/bellwoodhub/commit/${FULL_SHA}` : "";
