"use client";

import { useEffect } from "react";
import Button from "./Button";

export default function ErrorPage({
  error,
  reset,
  icon = "⚠️",
  title = "Algo salió mal",
  description = "Ocurrió un error inesperado. Intentá de nuevo o contactá a soporte si el problema persiste.",
  primaryActionLabel = "Intentar de nuevo",
  onPrimaryAction,
  secondaryActionLabel = "Volver al inicio",
  onSecondaryAction,
  technicalDetails,
}) {
  useEffect(() => {
    if (error) {
      console.error("Error capturado:", error);
    }
  }, [error]);

  const handleReset = () => {
    if (reset) {
      reset();
    } else if (onPrimaryAction) {
      onPrimaryAction();
    }
  };

  return (
    <div className="error-page" role="alert">
      <div className="error-page-content">
        <div className="error-page-icon" aria-hidden="true">
          {icon}
        </div>
        <h1 className="error-page-title">{title}</h1>
        <p className="error-page-description">{description}</p>
        {technicalDetails && (
          <details className="error-page-details">
            <summary>Detalles técnicos</summary>
            <pre className="error-page-code">
              {error?.message || error?.toString() || technicalDetails}
            </pre>
          </details>
        )}
        <div className="error-page-actions">
          {(reset || onPrimaryAction) && (
            <Button variant="primary" onClick={handleReset}>
              {primaryActionLabel}
            </Button>
          )}
          {onSecondaryAction && (
            <Button variant="ghost" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
