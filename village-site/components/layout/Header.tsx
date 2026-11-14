import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import { localePath, type Locale } from "@/lib/i18n";
import { menus } from "@/lib/nav";
import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { LanguageSwitch } from "./LanguageSwitch";
import { MainNav, type MenuView } from "./MainNav";
import { SearchForm } from "./SearchForm";

export function Header({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const menuViews: MenuView[] = menus.map((menu) => ({
    key: menu.key,
    label: dict.nav.menus[menu.key],
    blurb: dict.nav.menuBlurbs[menu.key],
    href: localePath(locale, menu.href),
    overviewLabel: `${dict.nav.menus[menu.key]} ${dict.common.overview}`,
    items: menu.items.map((item) => ({
      label: dict.nav.items[item.key],
      href: localePath(locale, item.href),
    })),
  }));

  const phone = (
    <a
      href={site.villageHall.phoneHref}
      className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline-offset-4 hover:underline"
    >
      <Icon name="phone" size={18} />
      <span className="sr-only">{dict.common.call} </span>
      {site.villageHall.phone}
    </a>
  );
  const language = <LanguageSwitch locale={locale} labels={dict.common} />;

  return (
    <header className="border-b border-line bg-white">
      <Container className="flex items-center justify-between gap-4 py-3">
        <Link
          href={localePath(locale, "/")}
          className="flex items-center gap-3 text-navy-900"
          aria-label={`${dict.common.villageName}, ${dict.common.villageState} — ${dict.common.home}`}
        >
          {/* TODO(content): replace this monogram with the official village seal (SVG). */}
          <span
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-gold-500 bg-navy-800 text-xl font-bold text-gold-400"
          >
            B
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-bold sm:text-xl">{dict.common.villageName}</span>
            <span className="block text-sm font-medium text-ink-3">{dict.common.villageState}</span>
          </span>
        </Link>

        {/* Desktop: search, language and phone sit beside the name */}
        <div className="hidden items-center gap-6 text-navy-900 md:flex">
          <div className="w-64 lg:w-80">
            <SearchForm
              id="header-search"
              action={localePath(locale, "/search")}
              label={dict.common.searchLabel}
              placeholder={dict.common.search}
              buttonLabel={dict.common.search}
            />
          </div>
          {language}
          {phone}
        </div>

        {/* Phone: a search link; language and phone live in the menu */}
        <Link
          href={localePath(locale, "/search")}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-navy-800 px-3 font-bold text-navy-900 md:hidden"
        >
          <Icon name="search" />
          {dict.common.search}
        </Link>
      </Container>

      <MainNav
        menus={menuViews}
        labels={{ main: dict.nav.main, menu: dict.common.menu, closeMenu: dict.common.closeMenu }}
        mobileExtras={
          <>
            {language}
            {phone}
          </>
        }
      />
    </header>
  );
}
