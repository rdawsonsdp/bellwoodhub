"use client";
/*
 * ReleaseTag — the release identifier under the app heading (RD 2026-07-05):
 * the short commit SHA + branch of the build Vercel is serving, linking to
 * the commit on GitHub. Renders nothing in local dev (no build-time SHA).
 */
import { C, FONT } from "@/lib/cos-design";
import { RELEASE_SHA, RELEASE_REF, RELEASE_URL } from "@/lib/release";

export default function ReleaseTag({ size = 8.5 }: { size?: number }) {
  if (!RELEASE_SHA) return null;
  return (
    <a
      href={RELEASE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`Deployed release ${RELEASE_SHA}${RELEASE_REF ? ` · ${RELEASE_REF}` : ""} — view on GitHub`}
      style={{ display: "inline-block", fontFamily: FONT.mono, fontSize: size, color: C.dim, letterSpacing: ".07em", textDecoration: "none", marginTop: 2, whiteSpace: "nowrap" }}
    >
      rel {RELEASE_SHA}{RELEASE_REF ? ` · ${RELEASE_REF}` : ""}
    </a>
  );
}
