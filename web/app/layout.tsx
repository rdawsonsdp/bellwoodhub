import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { tenant } from "@/lib/tenant";

export const metadata: Metadata = {
  title: tenant.title,
  description:
    `Ask ${tenant.orgName}'s entire archive in plain English — grounded, cited answers.`,
  manifest: "/manifest.webmanifest",
  // Standalone PWA + American-flag home-screen icon (app/apple-icon.png) on iOS.
  appleWebApp: {
    capable: true,
    title: tenant.shortName,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a1322",
  // width/initial-scale pin responsive scaling; viewport-fit=cover is what makes
  // the env(safe-area-inset-*) variables non-zero on notched phones — without it
  // every safe-area padding in the app (header, nav, sheets) collapsed to 0.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,500,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
