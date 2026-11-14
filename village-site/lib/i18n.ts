// Languages the site is published in. English lives at the plain URL
// ("/services/pay-a-bill"); Spanish lives under "/es". See proxy.ts.
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function hasLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Turn a site path ("/services/pay-a-bill") into the right URL for a language. */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith("/")) return path; // external link, mailto:, tel:
  if (locale === defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Remove a leading language segment from a URL path. */
export function stripLocale(pathname: string): string {
  for (const locale of locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname || "/";
}

/** Pick the right language from a row that stores English and Spanish side by side. */
export function pick(locale: Locale, en: string, es?: string | null): string {
  return locale === "es" && es ? es : en;
}

export function formatDate(
  locale: Locale,
  iso: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "long" },
): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: "America/Chicago",
    ...options,
  }).format(new Date(iso));
}
