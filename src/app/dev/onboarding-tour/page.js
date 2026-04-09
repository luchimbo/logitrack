"use client";

import { useState } from "react";
import OnboardingTour from "@/components/OnboardingTour";

const TABS = [
  { id: "upload", label: "Subir Etiquetas" },
  { id: "dashboard", label: "Dashboard" },
  { id: "pickingList", label: "Lista de Picking" },
];

function formatAction(value) {
  if (value === "completed") return "Finalizado";
  if (value === "dismissed") return "Omitido";
  return "Sin accion";
}

export default function OnboardingTourDevPage() {
  const [showTour, setShowTour] = useState(true);
  const [activeTab, setActiveTab] = useState("upload");
  const [lastAction, setLastAction] = useState(null);

  const handleClose = (completed) => {
    setLastAction(completed ? "completed" : "dismissed");
    setShowTour(false);
  };

  const handleReset = () => {
    setActiveTab("upload");
    setLastAction(null);
    setShowTour(true);
  };

  return (
    <main className="main-content" style={{ marginLeft: 0 }}>
      {showTour ? (
        <OnboardingTour
          activeTab={activeTab}
          onClose={handleClose}
          onNavigate={setActiveTab}
        />
      ) : null}

      <div className="content-area" style={{ maxWidth: 960, margin: "0 auto", width: "100%" }}>
        <section className="section active">
          <div className="section-header">
            <h1 className="section-title">Sandbox de Tour Guiado</h1>
            <p className="section-subtitle">
              Esta pagina permite probar el tour sin usar login ni guardar estado en la base.
            </p>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="flex-between" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Controles</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                  Cambia la seccion activa o reabre el tour para repetir la prueba.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowTour(true)}>
                  Abrir tour
                </button>
                <button type="button" className="btn btn-primary" onClick={handleReset}>
                  Reiniciar prueba
                </button>
              </div>
            </div>
          </div>

          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card card accent">
              <div className="stat-value">{showTour ? "Abierto" : "Cerrado"}</div>
              <div className="stat-label">Estado del tour</div>
            </div>
            <div className="stat-card card info">
              <div className="stat-value">{TABS.find((tab) => tab.id === activeTab)?.label || activeTab}</div>
              <div className="stat-label">Seccion activa</div>
            </div>
            <div className="stat-card card success">
              <div className="stat-value">{formatAction(lastAction)}</div>
              <div className="stat-label">Ultima accion</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Simular navegacion</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? "btn btn-primary" : "btn btn-ghost"}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Checklist rapido</div>
            <div style={{ display: "grid", gap: 10, color: "var(--text-secondary)", fontSize: 14 }}>
              <div>1. El tour debe abrir en la bienvenida.</div>
              <div>2. Debe mostrar &quot;Pagina X de 4&quot; y una sola barra de progreso.</div>
              <div>3. &quot;Siguiente&quot; debe llevarte por Upload, Dashboard y Picking.</div>
              <div>4. &quot;Omitir por ahora&quot; debe cerrar el modal y marcar &quot;Omitido&quot;.</div>
              <div>5. &quot;Finalizar tour&quot; debe cerrar el modal y marcar &quot;Finalizado&quot;.</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
