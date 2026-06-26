/*
 * backend.ts — the strangler-fig switch. RETRIEVAL_BACKEND=poc (default) keeps
 * the live demo on the flat poc store; RETRIEVAL_BACKEND=canonical routes the
 * same API surface through the graph-augmented planner over canonical.*. Flip
 * surface-by-surface by pointing each route at this module instead of
 * ./retrieval directly; poc stays an instant rollback.
 */
import * as poc from "./retrieval";
import * as canonical from "./retrieval-canonical";
import type {
  AskResponse, AppliedFilters, EmailDetail, EntityResponse, Source,
} from "./types";

export type SearchOpts = poc.SearchOpts;

const useCanonical = (process.env.RETRIEVAL_BACKEND || "poc").toLowerCase() === "canonical";

export const RETRIEVAL_BACKEND = useCanonical ? "canonical" : "poc";

export const ask: (question: string, filters?: SearchOpts) => Promise<AskResponse> =
  useCanonical ? canonical.ask : poc.ask;

export const searchSources: (
  question: string,
  filters?: SearchOpts,
) => Promise<{ sources: Source[]; crossSource: boolean; applied?: AppliedFilters }> =
  useCanonical ? canonical.searchSources : poc.searchSources;

export const getEntity: (type: "person" | "address", value: string) => Promise<EntityResponse> =
  useCanonical ? canonical.getEntity : poc.getEntity;

export const getEmailByMessageId: (mid: string) => Promise<EmailDetail | null> =
  useCanonical ? canonical.getEmailByMessageId : poc.getEmailByMessageId;
