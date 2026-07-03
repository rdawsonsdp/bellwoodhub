/*
 * middleware.ts — session gate, dormant until AUTH_ENABLED=1 (L0.1). With the
 * flag unset (every current env, including the keyless demo) every request
 * passes straight through untouched; no auth code runs at request time.
 */
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { auth } from "@/lib/auth";

// Paths that stay open when the gate is on: NextAuth's own flow; cron routes
// (CRON_SECRET-guarded); the access-telemetry sink (x-internal-key-guarded —
// our own waitUntil fetch below carries no session cookie); the MCP
// transports served by app/api/[transport] (mcp-handler basePath "/api" →
// /api/mcp, /api/sse, /api/message — MCP_SECRET-guarded); Next internals;
// and the PWA/public assets the sign-in page and home-screen icon need
// before a session exists.
const OPEN: RegExp[] = [
  /^\/api\/auth\//,
  /^\/api\/cron\//,
  /^\/api\/telemetry$/,
  /^\/api\/(mcp|sse|message)/,
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/manifest\.webmanifest$/,
  /^\/(icon\.svg|apple-icon\.png)$/,
  /^\/(bellwood\.webp|flag-192\.png|flag-512\.png)$/,
];

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (process.env.AUTH_ENABLED !== "1") return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (OPEN.some((re) => re.test(pathname))) return NextResponse.next();

  // auth() wrapper form: edge-safe session decode; r.auth is the session.
  // The explicit params pin the NextAuthMiddleware overload (not the route
  // handler one, whose ctx wants params).
  return auth((r: NextAuthRequest, _ev: NextFetchEvent) => {
    if (r.auth?.user) {
      // Access telemetry (top-risk directive): each authenticated PAGE view
      // (not /api/*, not asset-like paths) posts one 'access.page' ledger row
      // via /api/telemetry, forwarding the visitor's own IP/UA/geo headers.
      // waitUntil, never await — zero added latency; .catch so a telemetry
      // hiccup can never break the page it records.
      if (!pathname.startsWith("/api/") && !/\.\w+$/.test(pathname)) {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          "x-internal-key": process.env.CRON_SECRET ?? "",
        };
        for (const h of [
          "x-forwarded-for",
          "user-agent",
          "x-vercel-ip-city",
          "x-vercel-ip-country",
          "x-vercel-ip-country-region",
        ]) {
          const v = req.headers.get(h);
          if (v) headers[h] = v;
        }
        event.waitUntil(
          fetch(new URL("/api/telemetry", req.url), {
            method: "POST",
            headers,
            body: JSON.stringify({ path: pathname }),
          }).catch(() => {}),
        );
      }
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages bounce to the sign-in flow and come back where they started.
    const signInUrl = r.nextUrl.clone();
    signInUrl.pathname = "/api/auth/signin";
    signInUrl.search = "";
    signInUrl.searchParams.set("callbackUrl", r.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  })(req, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
