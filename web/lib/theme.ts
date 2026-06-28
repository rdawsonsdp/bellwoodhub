/*
 * theme.ts — theme resolution, including the "Auto · time of day" mode that lets
 * the app live with the day: bright warm morning → clean cool midday → warm dusk
 * evening → deep calm night. Stored value "auto" resolves to one of the four
 * time-of-day palettes by the local hour; any other value is a pinned theme.
 */
export const THEME_KEY = "bw-theme";
export const DEFAULT_THEME = "auto";

export type Band = "am" | "midday" | "evening" | "night";

/** Which time-of-day palette applies at this local hour. */
export function bandForHour(h: number): Band {
  if (h >= 5 && h < 11) return "am";
  if (h >= 11 && h < 17) return "midday";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

/** Resolve a stored theme to an actual data-theme value (handles "auto"). */
export function resolveTheme(stored: string | null | undefined, hour: number): string {
  if (!stored || stored === "auto") return bandForHour(hour);
  return stored;
}

/** Apply a stored theme (resolving "auto" against the current hour) to <html>. */
export function applyTheme(stored: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(stored, new Date().getHours()));
}

/**
 * Keep "auto" fresh through the day: re-resolve every few minutes so the palette
 * shifts as the clock crosses a band. No-op while a manual theme is pinned.
 * Returns a cleanup function.
 */
export function watchAutoTheme(): () => void {
  const tick = () => {
    let stored = DEFAULT_THEME;
    try { stored = localStorage.getItem(THEME_KEY) || DEFAULT_THEME; } catch { /* */ }
    if (stored === "auto") applyTheme("auto");
  };
  tick();
  const timer = setInterval(tick, 5 * 60 * 1000);
  return () => clearInterval(timer);
}
