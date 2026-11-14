import type { Locale } from "@/lib/i18n";
import en, { type Dictionary } from "./en";
import es from "./es";

export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { en, es };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
