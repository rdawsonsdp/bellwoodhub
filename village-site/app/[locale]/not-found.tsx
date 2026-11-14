import Link from "next/link";
import { locale as rootLocale } from "next/root-params";
import { getDictionary } from "@/lib/dictionaries";
import { hasLocale, localePath, type Locale } from "@/lib/i18n";
import { Container } from "@/components/ui/Container";
import { LinkCard } from "@/components/ui/LinkCard";
import { SearchForm } from "@/components/layout/SearchForm";

export default async function NotFound() {
  const value = await rootLocale();
  const locale: Locale = value && hasLocale(value) ? value : "en";
  const dict = getDictionary(locale);
  const popular = [
    { href: "/services/pay-a-bill", title: dict.nav.items.payBill },
    { href: "/services/report-a-problem", title: dict.nav.items.reportProblem },
    { href: "/government/meetings", title: dict.nav.items.meetings },
    { href: "/contact", title: dict.footer.contact },
  ];

  return (
    <Container className="py-12">
      <h1 className="text-3xl font-bold text-navy-900 sm:text-4xl">{dict.common.notFoundTitle}</h1>
      <p className="mt-3 max-w-2xl text-lg">{dict.common.notFoundBody}</p>
      <div className="mt-6 max-w-xl">
        <SearchForm
          id="not-found-search"
          size="lg"
          action={localePath(locale, "/search")}
          label={dict.common.searchLabel}
          placeholder={dict.common.searchPlaceholder}
          buttonLabel={dict.common.search}
        />
      </div>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {popular.map((link) => (
          <li key={link.href}>
            <LinkCard href={localePath(locale, link.href)} title={link.title} />
          </li>
        ))}
      </ul>
      <p className="mt-8">
        <Link href={localePath(locale, "/")} className="prose-link font-semibold">
          {dict.common.backHome}
        </Link>
      </p>
    </Container>
  );
}
