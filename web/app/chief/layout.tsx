import type { ReactNode } from "react";

export const metadata = {
  title: "Mayor's AI Chief of Staff — Village of Bellwood",
  description:
    "Graph-augmented, entity-resolved institutional memory for the Mayor's office. Agents draft; the Mayor decides.",
};

// Fonts ported from the Claude Design prototype (Public Sans / Newsreader /
// JetBrains Mono). App Router hoists these <link>s into <head>.
export default function ChiefLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Apply the saved theme before paint (no flash). Default: midnight. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('bw-theme')||'midnight';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','midnight');}})();`,
        }}
      />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&family=Newsreader:ital,opsz,wght@0,16..72,400;0,16..72,500;0,16..72,600;1,16..72,400&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
