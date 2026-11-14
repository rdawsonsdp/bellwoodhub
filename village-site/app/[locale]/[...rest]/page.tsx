import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { hasLocale, localePath, locales } from "@/lib/i18n";
import { allKnownPaths, findPage } from "@/lib/pages";
import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { LinkCard } from "@/components/ui/LinkCard";
import { PageHeader } from "@/components/ui/PageHeader";

// Fallback for every path in the navigation that doesn't have its own page
// file yet. A menu path ("/services") gets an overview of that menu's pages;
// any other known path gets a short "being written" notice so no menu link is
// ever a dead end. Unknown paths get the 404 page.

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    allKnownPaths().map((path) => ({ locale, rest: path.split("/").filter(Boolean) })),
  );
}

export async function generateMetadata({ params }: PageProps<"/[locale]/[...rest]">): Promise<Metadata> {
  const { locale, rest } = await params;
  if (!hasLocale(locale)) return {};
  const page = findPage(`/${rest.join("/")}`, getDictionary(locale));
  return page ? { title: page.title } : {};
}

export default async function FallbackPage({ params }: PageProps<"/[locale]/[...rest]">) {
  const { locale, rest } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const page = findPage(`/${rest.join("/")}`, dict);
  if (!page) notFound();

  const home = { label: dict.common.home, href: localePath(locale, "/") };

  if (page.kind === "menu") {
    return (
      <>
        <PageHeader
          title={page.title}
          intro={dict.nav.menuBlurbs[page.menu.key]}
          crumbs={[home, { label: page.title }]}
          breadcrumbLabel={dict.common.breadcrumb}
        />
        <Container className="py-10">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.menu.items.map((item) => (
              <li key={item.href}>
                <LinkCard href={localePath(locale, item.href)} title={dict.nav.items[item.key]} />
              </li>
            ))}
          </ul>
        </Container>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={page.title}
        crumbs={[
          home,
          ...(page.menu
            ? [{ label: dict.nav.menus[page.menu.key], href: localePath(locale, page.menu.href) }]
            : []),
          { label: page.title },
        ]}
        breadcrumbLabel={dict.common.breadcrumb}
      />
      <Container className="py-10">
        {/* TODO(content): this page has not been written yet — see TODO-CONTENT.md. */}
        <div className="max-w-2xl rounded-xl border-2 border-gold-500 bg-gold-50 p-6">
          <h2 className="text-xl font-bold text-navy-900">{dict.common.comingSoonTitle}</h2>
          <p className="mt-2">{dict.common.comingSoonBody}</p>
          <p className="mt-3">
            <a href={site.villageHall.phoneHref} className="prose-link text-lg font-bold">
              {dict.common.call} {site.villageHall.phone}
            </a>
          </p>
        </div>
      </Container>
    </>
  );
}
