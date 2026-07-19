import type { ReactNode } from "react";

export const metadata = {
  title: "Bellwood Hub — Source document",
  description: "A single record from the village's institutional memory.",
};

// Same pre-paint theme + fonts as the /hub shell so the deep-link page is
// visually the same app (Phase 4 thread view).
export default function EmailLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('bw-theme')||'daylight';if(t==='auto'){var h=new Date().getHours();t=(h>=5&&h<11)?'am':(h>=11&&h<17)?'midday':(h>=17&&h<21)?'evening':'night';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','daylight');}})();`,
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
