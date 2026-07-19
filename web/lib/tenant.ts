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
  /** Municipal tenants get the FOIA/village vocabulary and the built-in
   *  Police/Fire/Council cabinet. Non-municipal tenants (a bakery) start with an
   *  empty roster + their own created agents, and drop the civic words. */
  isMunicipal?: boolean;
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
  isMunicipal: true,
};

/*
 * Brown Sugar Bakery — the first non-municipal tenant. The fields were named
 * for a village (orgName/state/established/seal), but they generalize: orgName
 * is just the org, `established` is the founding year, and the "mayor" persona
 * field is simply the person being briefed. `appName` carries what the product
 * calls itself in the chrome. `isMunicipal: false` is the switch that turns off
 * the village-only vocabulary and the built-in Police/Fire/Council cabinet — a
 * bakery starts with an empty roster and its own created agents.
 */
const brownsugar: TenantConfig = {
  id: "brownsugar",
  appName: "Shop Assistant",
  orgName: "Brown Sugar Bakery",
  shortName: "Brown Sugar",
  state: "Chicago",
  established: "2002",
  title: "Brown Sugar Bakery — Shop Assistant",
  persona: { mayorName: "Stephanie", greeting: "Good {timeOfDay}, {name}.", tone: "warm", instructions: "" },
  githubRepo: "rdawsonsdp/bellwoodhub",
  isMunicipal: false,
};

export const TENANTS: Record<string, TenantConfig> = {
  bellwood,
  brownsugar,
};

export const TENANT_ID = (process.env.NEXT_PUBLIC_TENANT || "bellwood").toLowerCase();
export const tenant: TenantConfig = TENANTS[TENANT_ID] ?? bellwood;

/** The org prefix shown on the seal, e.g. "VILLAGE OF" from "Village of Bellwood". */
export const orgPrefix = tenant.orgName.replace(tenant.shortName, "").trim().toUpperCase();
