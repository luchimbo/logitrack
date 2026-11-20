"use client";

import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="error-page" role="alert">
      <div className="error-page-content">
        <div className="error-page-icon" aria-hidden="true">
          🔍
        </div>
        <h1 className="error-page-title">Página no encontrada</h1>
        <p className="error-page-description">
          La sección que buscás no existe o fue movida. Verificá la URL o volvé al inicio.
        </p>
        <div className="error-page-actions">
          <Button variant="primary" onClick={() => router.push("/app")}>
            Volver al inicio
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>
            Ir atrás
          </Button>
        </div>
      </div>
    </div>
  );
}
