"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export type MenuView = {
  key: string;
  label: string;
  blurb: string;
  href: string;
  overviewLabel: string;
  items: { label: string; href: string }[];
};

// The five menus. Desktop: a row of buttons, each opening a panel of links.
// Phone: one "Menu" button opening an accordion. Everything is reachable by
// keyboard; Escape closes the open panel and returns focus to its button.
export function MainNav({
  menus,
  labels,
  mobileExtras,
}: {
  menus: MenuView[];
  labels: { main: string; menu: string; closeMenu: string };
  /** Language switch and phone number, shown at the bottom of the phone menu. */
  mobileExtras: ReactNode;
}) {
  const pathname = usePathname();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();

  // Close everything after moving to a new page.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpenKey(null);
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!openKey && !mobileOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openKey) {
        buttonRefs.current[openKey]?.focus();
        setOpenKey(null);
      } else {
        mobileButtonRef.current?.focus();
        setMobileOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenKey(null);
    }
    function onFocusIn(event: FocusEvent) {
      if (openKey && navRef.current && !navRef.current.contains(event.target as Node)) setOpenKey(null);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [openKey, mobileOpen]);

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav ref={navRef} aria-label={labels.main} className="on-dark relative bg-navy-800 text-white">
      {/* Phone: one button */}
      <div className="mx-auto flex max-w-6xl px-4 md:hidden">
        <button
          ref={mobileButtonRef}
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={`${baseId}-mobile`}
          onClick={() => setMobileOpen((open) => !open)}
          className="-mx-2 inline-flex min-h-12 items-center gap-2 px-2 text-base font-bold"
        >
          <Icon name={mobileOpen ? "close" : "menu"} size={24} />
          {mobileOpen ? labels.closeMenu : labels.menu}
        </button>
      </div>

      <div id={`${baseId}-mobile`} hidden={!mobileOpen} className="border-t border-white/20 md:hidden">
        <ul className="mx-auto max-w-6xl px-4 pb-4">
          {menus.map((menu) => {
            const open = mobileSection === menu.key;
            const panelId = `${baseId}-m-${menu.key}`;
            return (
              <li key={menu.key} className="border-b border-white/20">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setMobileSection(open ? null : menu.key)}
                  className="flex min-h-12 w-full items-center justify-between py-2 text-left text-lg font-bold"
                >
                  {menu.label}
                  <Icon name="chevronDown" className={open ? "rotate-180" : ""} />
                </button>
                <ul id={panelId} hidden={!open} className="pb-3">
                  <li>
                    <Link href={menu.href} className="flex min-h-11 items-center font-semibold text-gold-400 underline underline-offset-4">
                      {menu.overviewLabel}
                    </Link>
                  </li>
                  {menu.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={pathname === item.href ? "page" : undefined}
                        className="flex min-h-11 items-center underline-offset-4 hover:underline"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pb-4">{mobileExtras}</div>
      </div>

      {/* Desktop: five buttons */}
      <ul className="mx-auto hidden max-w-6xl px-4 sm:px-6 md:flex">
        {menus.map((menu) => {
          const open = openKey === menu.key;
          const panelId = `${baseId}-d-${menu.key}`;
          return (
            <li key={menu.key}>
              <button
                ref={(el) => {
                  buttonRefs.current[menu.key] = el;
                }}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenKey(open ? null : menu.key)}
                className={`inline-flex min-h-12 items-center gap-1.5 border-b-4 px-4 text-base font-bold hover:bg-navy-900 lg:px-5 lg:text-[1.05rem] ${
                  open || isCurrent(menu.href) ? "border-gold-400" : "border-transparent"
                } ${open ? "bg-navy-900" : ""}`}
              >
                {menu.label}
                <Icon name="chevronDown" size={18} className={open ? "rotate-180" : ""} />
              </button>
              <div
                id={panelId}
                hidden={!open}
                className="absolute inset-x-0 top-full z-40 border-b-4 border-gold-400 bg-navy-900 shadow-xl"
              >
                <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[16rem_1fr]">
                  <div>
                    <p className="text-xl font-bold">{menu.label}</p>
                    <p className="mt-1 text-navy-100">{menu.blurb}</p>
                    <Link
                      href={menu.href}
                      className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-gold-400 underline underline-offset-4"
                    >
                      {menu.overviewLabel}
                      <Icon name="arrowRight" size={18} />
                    </Link>
                  </div>
                  <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                    {menu.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={pathname === item.href ? "page" : undefined}
                          className="flex min-h-11 items-center border-b border-white/15 py-1 underline-offset-4 hover:text-gold-400 hover:underline"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
