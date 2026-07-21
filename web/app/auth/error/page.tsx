"use client";
/*
 * Auth error page — the graceful landing when a sign-in can't complete.
 *
 * The case that matters: a first Outlook sign-in on a government Microsoft 365
 * tenant that requires admin approval (AADSTS65001). Auth.js collapses the raw
 * Microsoft error into a generic code, so we can't read "AADSTS65001" here — but
 * an OAuth-callback failure on this app almost always IS the consent gate, so we
 * lead with that and give both a self-serve admin path and an email-IT path.
 * AccessDenied is different (the allowlist said no) and gets its own message.
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { C, FONT } from "@/lib/cos-design";

const IT_SUBJECT = "Approve Bellwood Hub — read-only Outlook access";
const IT_BODY = `Hello,

I'm setting up Bellwood Hub, an assistant that reads my own Outlook mailbox and calendar (read-only) to help me manage email. Signing in needs a one-time tenant admin approval.

The app requests only delegated Microsoft Graph permissions — Mail.Read, Calendars.Read, openid, profile, email, offline_access. No application-level permissions, no write or send access, and no access to anyone else's mailbox.

Could you grant tenant admin consent for this application? In the Entra admin center: Enterprise applications -> find the app (Application/client ID is on its Overview page) -> Permissions -> "Grant admin consent". Happy to walk through it.

Thank you.`;

function ErrorInner() {
  const code = useSearchParams().get("error") || "Default";
  const allowlist = code === "AccessDenied";

  const mailto = `mailto:?subject=${encodeURIComponent(IT_SUBJECT)}&body=${encodeURIComponent(IT_BODY)}`;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px", background: "var(--c-appbg)", color: C.text, fontFamily: FONT.sans }}>
      <div style={{ width: "100%", maxWidth: 520, border: `1px solid ${C.line}`, borderRadius: 18, padding: "30px 28px", background: "rgba(var(--ink),.02)" }}>
        {allowlist ? (
          <>
            <div style={{ fontFamily: FONT.serif, fontSize: 24, fontWeight: 600, lineHeight: 1.2, marginBottom: 10 }}>This account isn&rsquo;t approved yet</div>
            <p style={{ fontSize: 14.5, color: C.text2, lineHeight: 1.6, marginBottom: 22 }}>
              You signed in successfully, but this email isn&rsquo;t on the Bellwood Hub allowlist.
              Ask the administrator to add it, then try again.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/hub" style={ghostBtn}>Back to sign in</a>
            </div>
          </>
        ) : (
          <>
            <div style={{ ...eyebrow }}>Outlook · one-time approval</div>
            <div style={{ fontFamily: FONT.serif, fontSize: 24, fontWeight: 600, lineHeight: 1.2, margin: "6px 0 10px" }}>One approval needed to connect Outlook</div>
            <p style={{ fontSize: 14.5, color: C.text2, lineHeight: 1.6, marginBottom: 14 }}>
              Bellwood Hub asked to read your Outlook mail and calendar (read-only). Your Microsoft&nbsp;365
              organization requires this to be approved once before you can sign in.
            </p>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 15px", marginBottom: 20, background: "rgba(var(--ink),.03)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>If you&rsquo;re an administrator</div>
              <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.55, margin: 0 }}>
                Sign in again and tick <b style={{ color: C.text }}>&ldquo;Consent on behalf of your organization&rdquo;</b> on
                the Microsoft screen. That approves it for everyone, once.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => void signIn("microsoft-entra-id", { callbackUrl: "/hub" })} style={primaryBtn}>
                Try Outlook sign-in again
              </button>
              <a href={mailto} style={ghostBtn}>Email my IT admin</a>
            </div>
            <p style={{ fontSize: 12, color: C.text3, lineHeight: 1.55, marginTop: 16 }}>
              Not an administrator? Send the request above to whoever manages your Microsoft&nbsp;365 accounts —
              they approve it once and you&rsquo;re in for good.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <ErrorInner />
    </Suspense>
  );
}

const eyebrow = { fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase" as const, color: C.gold, fontWeight: 700 };
const primaryBtn = { cursor: "pointer", border: 0, borderRadius: 11, padding: "11px 18px", fontWeight: 800, fontSize: 13.5, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" };
const ghostBtn = { cursor: "pointer", textDecoration: "none", borderRadius: 11, padding: "11px 18px", fontWeight: 700, fontSize: 13.5, fontFamily: FONT.sans, border: `1px solid ${C.line}`, background: "transparent", color: C.text, display: "inline-block" };
