import type { Dictionary } from "@/lib/dictionaries";
import { menus, type NavMenu } from "@/lib/nav";

// Pages that sit outside the five menus (linked from the footer and header).
export const utilityPages = [
  { href: "/contact", label: (d: Dictionary) => d.footer.contact },
  { href: "/faq", label: (d: Dictionary) => d.footer.faq },
  { href: "/accessibility", label: (d: Dictionary) => d.footer.accessibility },
  { href: "/privacy", label: (d: Dictionary) => d.footer.privacy },
  { href: "/site-map", label: (d: Dictionary) => d.footer.siteMap },
  { href: "/search", label: (d: Dictionary) => d.common.search },
];

export type KnownPage =
  | { kind: "menu"; menu: NavMenu; title: string }
  | { kind: "page"; menu?: NavMenu; title: string };

/** Look up a site path in the navigation. Returns null for paths the site doesn't have. */
export function findPage(path: string, dict: Dictionary): KnownPage | null {
  for (const menu of menus) {
    if (menu.href === path) return { kind: "menu", menu, title: dict.nav.menus[menu.key] };
    const item = menu.items.find((i) => i.href === path);
    if (item) return { kind: "page", menu, title: dict.nav.items[item.key] };
  }
  const utility = utilityPages.find((p) => p.href === path);
  return utility ? { kind: "page", title: utility.label(dict) } : null;
}

/** Every path in the navigation (used to pre-build pages and the site map). */
export function allKnownPaths(): string[] {
  return [
    ...menus.flatMap((menu) => [menu.href, ...menu.items.map((i) => i.href)]),
    ...utilityPages.map((p) => p.href),
  ];
}
