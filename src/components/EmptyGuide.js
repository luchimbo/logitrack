"use client";

// Aviso con acciones para pantallas sin datos o con una carga fallida.
export default function EmptyGuide({ title, text, actions = [], onNavigate, onRetry, error = false, children }) {
  return <div className="empty-state" role={error ? "alert" : "status"} style={error ? { color: "var(--danger)" } : undefined}>
    <p className="empty-state-text"><strong>{title}</strong></p>
    {text ? <p className="empty-state-text">{text}</p> : null}
    {children}
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "12px" }}>
      {onRetry ? <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>Reintentar</button> : null}
      {onNavigate ? actions.map((action) => <button key={action.tab} type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate(action.tab)}>{action.label}</button>) : null}
    </div>
  </div>;
}
