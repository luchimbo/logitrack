const sizes = {
  sm: { width: 120, gap: 4, tagline: 11 },
  md: { width: 180, gap: 6, tagline: 12 },
  lg: { width: 280, gap: 8, tagline: 14 },
};

export default function GeoModiLogo({ size = "md", withTagline = false, centered = false }) {
  const current = sizes[size] || sizes.md;

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: centered ? "center" : "flex-start",
        gap: current.gap,
      }}
    >
      <img
        src="/logoGeoModi.png"
        alt="GeoModi"
        style={{
          width: `${current.width}px`,
          height: "auto",
          display: "block",
          maxWidth: "100%",
        }}
      />
      {withTagline ? (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: current.tagline,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Gestion Logistica
        </div>
      ) : null}
    </div>
  );
}
