const ICONS = {
  operation: "M4 5h16v14H4z M8 2v6 M16 2v6 M7 11h10 M7 15h6",
  upload: "M12 16V4 M7 9l5-5 5 5 M5 18h14",
  picking: "M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h3",
  flex: "M4 15h11V6h3l3 4v5h-2 M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M18 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  colecta: "M4 7h16v11H4z M8 7V4h8v3 M8 12h8",
  map: "M9 18 3 21V6l6-3 6 3 6-3v15l-6 3z M9 3v15 M15 6v15",
  dashboard: "M5 19V10 M12 19V5 M19 19v-7",
  zones: "M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  integrations: "M8 12h8 M8 8h8 M8 16h8 M4 4h16v16H4z",
  print: "M7 8V3h10v5 M6 17H4v-7h16v7h-2 M7 14h10v7H7z",
  settings: "M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5 M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2 2-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20h-2.8v-.1a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2-2 .06-.06A1.7 1.7 0 0 0 7.46 15a1.7 1.7 0 0 0-1.55-1H5.8v-2.8h.1a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2-2 .06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.55V4h2.8v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2 2-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1h.1V14h-.1a1.7 1.7 0 0 0-1.55 1z",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 11a3 3 0 0 0 0-6 M21 20v-1a4 4 0 0 0-3-3.87",
};

export default function AppIcon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ICONS.operation} /></svg>;
}
