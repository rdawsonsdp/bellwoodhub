// Small inline icon set. Icons are decorative: the text next to them carries
// the meaning, so every icon is hidden from screen readers.
const paths = {
  search: "M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  phone:
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2",
  pin: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  alert: "M12 3l10 18H2L12 3zM12 10v5M12 18h.01",
  info: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 11v6M12 7.5h.01",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  wrench:
    "M14.5 6.5a4 4 0 0 0 5 5L21 13l-8.5 8.5a2.1 2.1 0 0 1-3-3L18 10M14.5 6.5L18 3M14.5 6.5l-11 11",
  clipboard: "M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v5M16 3v5",
  car: "M5 16l1.5-6h11L19 16M3 16h18v3H3zM7 19v1M17 19v1M7.5 13h9",
  building: "M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3",
  briefcase: "M3 8h18v12H3zM9 8V5h6v3M3 13h18",
  document: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  bell: "M6 17V11a6 6 0 1 1 12 0v6l2 2H4l2-2zM10 21h4",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0-1-5.8M18 14a6 6 0 0 1 4 6",
  globe: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
  pause: "M8 5v14M16 5v14",
  play: "M7 4l13 8-13 8z",
  check: "M4 12l5 5L20 6",
  download: "M12 3v12M7 11l5 5 5-5M4 20h16",
  fork: "M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 7 0 9v9",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ""}`}
    >
      <path d={paths[name]} />
    </svg>
  );
}
