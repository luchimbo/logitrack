"use client";

export default function MobileSelectionBar({ children, count, label = "elementos", onClear }) {
  if (!count) return null;

  return (
    <>
    <aside className="mobile-selection-bar" aria-label="Acciones para la selección">
      <div className="mobile-selection-summary" aria-live="polite">
        <strong>{count} {label}</strong>
        {onClear ? <button type="button" onClick={onClear}>Cancelar selección</button> : null}
      </div>
      <div className="selection-action-grid">{children}</div>
    </aside>
    <div className="mobile-selection-spacer" aria-hidden="true" />
    </>
  );
}
