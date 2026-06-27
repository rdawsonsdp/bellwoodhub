"use client";
/*
 * ResponsiveChief — viewport switch. ≤768px gets the dedicated mobile UI
 * (MobileApp); wider gets the desktop ChiefApp unchanged. Only one tree mounts,
 * so there are no duplicate data fetches. First paint is a neutral themed shell
 * (server + client agree) until the media query resolves — no hydration flash.
 */
import { useState, useEffect } from "react";
import ChiefApp from "./ChiefApp";
import MobileApp from "./MobileApp";

export default function ResponsiveChief() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: "var(--c-appbg)" }} />;
  }
  return isMobile ? <MobileApp /> : <ChiefApp />;
}
