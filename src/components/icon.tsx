/**
 * Inline SVG icons (24 × 24, stroke = currentColor). Always decorative: the visible text next to
 * an icon carries the meaning, so every icon is aria-hidden. No image files, no icon font.
 */
const PATHS = {
  today: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  pill: "M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7zM7 7l7 7",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6",
  activity: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  check: "M4 12.5l5 5L20 6.5",
  skip: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  send: "M4 12l16-8-6 16-3-7z",
  ask: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  plus: "M12 5v14M5 12h14",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  sunrise: "M12 3v4M5.6 9.6L4.2 8.2M18.4 9.6l1.4-1.4M3 17h18M7 17a5 5 0 0 1 10 0M8 21h8",
  sunset: "M3 17h18M7 17a5 5 0 0 1 10 0M12 3v6M9 6l3 3 3-3M8 21h8",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  close: "M6 6l12 12M18 6L6 18",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01",
  speaker: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "icon" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Brand mark: a heart held inside a circle, in the brand blue. */
export function LogoMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="#0b3d91" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="52 14" />
      <path d="M16 22.5s-6-3.7-6-8a3.4 3.4 0 0 1 6-2.2 3.4 3.4 0 0 1 6 2.2c0 4.3-6 8-6 8z" fill="#ffffff" />
    </svg>
  );
}
