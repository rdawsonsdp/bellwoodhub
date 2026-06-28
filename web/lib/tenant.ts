/*
 * tenant.ts — per-customer configuration. The codebase is shared across all
 * customers; everything customer-specific (branding, persona, data sources)
 * lives here and is selected by NEXT_PUBLIC_TENANT. Deploy model: one Vercel
 * project per customer, each with its own TENANT + isolated data/keys, all
 * tracking the same repo so improvements ship in lockstep. Default: bellwood.
 *
 * Phase 1 covers branding + persona. Phase 2 will move mailboxes, connector
 * defaults, and the demo fixture set under each tenant; live data stays isolated
 * per customer via env (DATABASE_URL / API keys / their own Supabase project).
 */
import type { CosPersona } from "./morning";

export interface TenantConfig {
  id: string;
  appName: string;     // product label in the chrome, e.g. "Chief of Staff"
  orgName: string;     // full org, e.g. "Village of Bellwood"
  shortName: string;   // wordmark, e.g. "Bellwood"
  state: string;       // e.g. "Illinois"
  established: string; // seal year, e.g. "1900"
  title: string;       // browser/document title
  persona: CosPersona; // Chief-of-Staff voice defaults
  githubRepo: string;  // where in-app feedback opens issues
}

const bellwood: TenantConfig = {
  id: "bellwood",
  appName: "Chief of Staff",
  orgName: "Village of Bellwood",
  shortName: "Bellwood",
  state: "Illinois",
  established: "1900",
  title: "Mayor's AI Chief of Staff — Village of Bellwood",
  persona: { mayorName: "Mayor Harvey", greeting: "Good {timeOfDay}, {name}.", tone: "warm", instructions: "" },
  githubRepo: "rdawsonsdp/bellwoodhub",
};

export const TENANTS: Record<string, TenantConfig> = {
  bellwood,
  // Add new customers here (or split into lib/tenants/<id>.ts as the list grows):
  // riverton: { id: "riverton", orgName: "City of Riverton", ... },
};

export const TENANT_ID = (process.env.NEXT_PUBLIC_TENANT || "bellwood").toLowerCase();
export const tenant: TenantConfig = TENANTS[TENANT_ID] ?? bellwood;

/** The org prefix shown on the seal, e.g. "VILLAGE OF" from "Village of Bellwood". */
export const orgPrefix = tenant.orgName.replace(tenant.shortName, "").trim().toUpperCase();
