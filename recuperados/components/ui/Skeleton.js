export default function Skeleton({
  count = 1,
  className = "",
  width,
  height,
  variant = "text",
}) {
  const items = Array.from({ length: count });

  return (
    <div className={`skeleton ${variant === "circular" ? "skeleton-circular" : ""} ${className}`} style={width || height ? { width, height } : undefined}>
      {items.map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
}
