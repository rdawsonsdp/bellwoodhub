import { HubApp } from "@/components/hub-app";

export const dynamic = "force-dynamic";

export default function HubPage({
  searchParams,
}: {
  searchParams: { q?: string | string[] };
}) {
  const q = typeof searchParams.q === "string" ? searchParams.q : undefined;
  return <HubApp initialQuestion={q} />;
}
