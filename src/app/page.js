"use client";

import { useState } from "react";
import UploadSection from "@/components/UploadSection";
import ZoneConfig from "@/components/ZoneConfig";
import FlexSection from "@/components/FlexSection";
import ColectaSection from "@/components/ColectaSection";
import PickingList from "@/components/PickingList";
import CarrierView from "@/components/CarrierView";
import { useBatch } from "@/components/BatchContext";

export default function Home() {
  const [activeTab, setActiveTab] = useState("upload");
  const { batches, currentBatchId, setCurrentBatchId } = useBatch();

  const renderSection = () => {
    switch (activeTab) {
      case "upload":
        return <UploadSection />;
      case "pickingList":
        return <PickingList />;
      case "flex":
        return <FlexSection />;
      case "colecta":
        return <ColectaSection />;
      case "zoneConfig":
        return <ZoneConfig />;
      case "carrierView":
        return <CarrierView />;
      default:
        return <div>Página no encontrada</div>;
    }
  };

  return (
    <>
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>LogiTrack</h2>
        </div>
        <ul className="nav-links">
          {[
            { id: "upload", icon: "upload", label: "Subir Archivo Cxt" },
            { id: "pickingList", icon: "list", label: "Listado de Picking" },
            { id: "flex", icon: "truck", label: "Logística Flex" },
            { id: "colecta", icon: "box", label: "Colecta Tradicional" },
            { id: "zoneConfig", icon: "settings", label: "Config. Zonas" },
            { id: "carrierView", icon: "users", label: "Vista Carrier" },
          ].map((link) => (
            <li key={link.id}>
              <a
                href="#"
                className={`nav-link ${activeTab === link.id ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab(link.id);
                }}
              >
                <i className={`icon-${link.icon}`}></i>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="main-content">
        <header className="topbar">
          <div className="search-bar" id="batch-selector">
            {!batches || batches.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Sin lotes cargados</p>
            ) : (
              <>
                <label className="form-label" style={{ marginRight: "10px", marginBottom: "0" }}>📅 Lote del día</label>
                <select
                  className="form-select"
                  style={{ fontSize: "12px", padding: "6px 8px", width: "auto" }}
                  value={currentBatchId || ""}
                  onChange={(e) => setCurrentBatchId(Number(e.target.value))}
                >
                  {batches.map((b) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const label = b.date === today ? "📅 HOY" : b.date;
                    return (
                      <option key={b.id} value={b.id}>
                        {label} — {b.total_packages} paq.
                      </option>
                    );
                  })}
                </select>
              </>
            )}
          </div>

          <div className="user-profile">
            <div className="avatar">A</div>
            <span>Admin Logística</span>
          </div>
        </header>

        <div className="content-area">
          {renderSection()}
        </div>
      </main>

      <div id="toast-container" className="toast-container"></div>
    </>
  );
}
