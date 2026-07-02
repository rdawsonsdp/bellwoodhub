import EmailStandalone from "./EmailStandalone";

export const dynamic = "force-dynamic";

// Deep-link route for a single source document (citations from MCP, push
// notifications, and old links). Phase 4: renders the SAME in-app ThreadView
// and theme tokens as the rest of Bellwood Hub — the light-theme "Back to the
// Hub" page is gone.
export default function EmailPage({ searchParams }: { searchParams: { mid?: string } }) {
  return <EmailStandalone mid={searchParams.mid ?? ""} />;
}
