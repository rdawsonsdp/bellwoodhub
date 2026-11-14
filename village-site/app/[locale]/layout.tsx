import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { hasLocale, locales } from "@/lib/i18n";
import { site } from "@/lib/site";
import { AlertBanner } from "@/components/layout/AlertBanner";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import "../globals.css";

const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"], display: "swap" });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Zoom stays allowed: no maximum-scale and no user-scalable=no (the current
// site switches pinch-zoom off).
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14335c" };

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(hasLocale(locale) ? locale : "en");
  return {
    metadataBase: new URL(site.url),
    title: { default: dict.meta.title, template: `%s | ${dict.common.villageName}` },
    description: dict.meta.description,
    // Keep search engines out until launch: the site still shows sample content.
    // Set NEXT_PUBLIC_SITE_LIVE=1 on the production deployment to allow indexing.
    robots: process.env.NEXT_PUBLIC_SITE_LIVE === "1" ? undefined : { index: false, follow: false },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <html lang={locale} className={`${publicSans.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-gold-400 focus:px-4 focus:py-3 focus:font-bold focus:text-navy-950"
        >
          {dict.common.skipToContent}
        </a>
        <AlertBanner locale={locale} dict={dict} />
        <Header locale={locale} dict={dict} />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <Footer locale={locale} dict={dict} />
      </body>
    </html>
  );
}
