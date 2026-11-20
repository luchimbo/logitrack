export default function InfoDisclosure({ title, description, children, className = "", defaultOpen = false, ...props }) {
  return (
    <details {...props} className={`info-disclosure ${className}`} open={defaultOpen || undefined}>
      <summary className="info-disclosure-summary">
        <span className="info-disclosure-copy">
          <span className="info-disclosure-title">{title}</span>
          {description ? <span className="info-disclosure-description">{description}</span> : null}
        </span>
        <span className="info-disclosure-indicator" aria-hidden="true" />
      </summary>
      <div className="info-disclosure-content">{children}</div>
    </details>
  );
}
