export default function GeoModiLogo({ size = "md", withTagline = false, centered = false }) {
  const sizes = {
    sm: {
      wordmark: "24px",
      tagline: "11px",
      gap: "4px",
    },
    md: {
      wordmark: "34px",
      tagline: "12px",
      gap: "6px",
    },
    lg: {
      wordmark: "44px",
      tagline: "14px",
      gap: "8px",
    },
  };

  const current = sizes[size] || sizes.md;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: centered ? "center" : "flex-start", gap: current.gap }}>
      <div
        aria-label="GeoModi"
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontWeight: 900,
          fontSize: current.wordmark,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "#b8b3ff" }}>GEO</span>
        <span style={{ color: "#f8fafc" }}>MODI</span>
      </div>
      {withTagline ? (
        <div style={{ color: "var(--text-muted)", fontSize: current.tagline, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Gestion Logistica
        </div>
      ) : null}
    </div>
  );
}
