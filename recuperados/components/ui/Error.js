"use client";

import ErrorPage from "@/components/ui/ErrorPage";

export default function Error({ error, reset }) {
  return (
    <ErrorPage
      error={error}
      reset={reset}
      title="Algo salió mal"
      description="Ocurrió un error inesperado. Intentá de nuevo o contactá a soporte si el problema persiste."
      primaryActionLabel="Intentar de nuevo"
      secondaryActionLabel="Volver al inicio"
      onSecondaryAction={() => (window.location.href = "/app")}
      technicalDetails
    />
  );
}
