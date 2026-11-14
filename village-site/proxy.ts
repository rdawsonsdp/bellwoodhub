import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "@/lib/i18n";

// Language routing. English pages live at the plain URL ("/services/pay-a-bill")
// and Spanish pages under "/es". Internally every page is under app/[locale],
// so plain URLs are rewritten to "/en/..." without the visitor seeing it.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // "/en/..." is never shown: send it to the plain URL.
  if (pathname === `/${defaultLocale}` || pathname.startsWith(`/${defaultLocale}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(defaultLocale.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }

  const hasLocale = locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (hasLocale) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next.js internals, the API, the staff admin area and static files.
  matcher: ["/((?!_next|api|admin|.*\\.[a-zA-Z0-9]+$).*)"],
};
