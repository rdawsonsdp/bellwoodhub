"use client";

import { usePathname } from "next/navigation";
import { localePath, stripLocale, type Locale } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";

// Links to the same page in the other language. A full page load (not a
// client transition) so the <html lang> attribute is always right.
export function LanguageSwitch({
  locale,
  labels,
  className = "",
}: {
  locale: Locale;
  labels: { switchToSpanish: string; switchToEnglish: string; english: string; spanish: string };
  className?: string;
}) {
  const pathname = usePathname();
  const other: Locale = locale === "en" ? "es" : "en";
  const href = localePath(other, stripLocale(pathname));

  return (
    <a
      href={href}
      lang={other}
      hrefLang={other}
      aria-label={other === "es" ? labels.switchToSpanish : labels.switchToEnglish}
      className={`inline-flex min-h-11 items-center gap-1.5 font-semibold underline-offset-4 hover:underline ${className}`}
    >
      <Icon name="globe" size={18} />
      {other === "es" ? labels.spanish : labels.english}
    </a>
  );
}
