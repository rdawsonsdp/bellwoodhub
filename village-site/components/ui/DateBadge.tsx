import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n";

// A calendar-style date block. The <time> element carries the full date for
// screen readers and search engines.
export function DateBadge({ locale, iso }: { locale: Locale; iso: string }) {
  return (
    <time
      dateTime={iso}
      className="grid h-16 w-16 shrink-0 place-content-center rounded-lg bg-navy-800 text-center text-white"
    >
      <span className="block text-xs font-bold uppercase tracking-wide text-gold-400">
        {formatDate(locale, iso, { month: "short" })}
      </span>
      <span className="block text-2xl font-bold leading-none">{formatDate(locale, iso, { day: "numeric" })}</span>
      <span className="sr-only">{formatDate(locale, iso, { year: "numeric" })}</span>
    </time>
  );
}
