"use client";

import { useState } from "react";
import UploadSection from "@/components/UploadSection";
import ZoneConfig from "@/components/ZoneConfig";
import FlexSection from "@/components/FlexSection";
import ColectaSection from "@/components/ColectaSection";
import PickingList from "@/components/PickingList";
import CarrierView from "@/components/CarrierView";
import Dashboard from "@/components/Dashboard";
import { useBatch } from "@/components/BatchContext";

const PERIODS = [
  { id: 'today', label: 'Hoy', icon: '📅' },
  { id: 'date', label: 'Fecha', icon: '🗓️' },
  { id: 'week', label: 'Semana', icon: '📆' },
  { id: 'month', label: 'Mes', icon: '📊' },
  { id: 'year', label: 'Año', icon: '📈' },
  { id: 'all', label: 'Todo', icon: '🗃️' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("upload");
  const { period, setPeriod, specificDate, setSpecificDate } = useBatch();

  const renderSection = () => {
    switch (activeTab) {
      case "upload": return <UploadSection />;
      case "pickingList": return <PickingList />;
      case "flex": return <FlexSection />;
      case "colecta": return <ColectaSection />;
      case "zoneConfig": return <ZoneConfig />;
      case "carrierView": return <CarrierView />;
      case "dashboard": return <Dashboard />;
      default: return <div>Página no encontrada</div>;
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
            { id: "upload", icon: "📦", label: "Subir Etiquetas" },
            { id: "pickingList", icon: "📋", label: "Lista de Picking" },
            { id: "flex", icon: "🚀", label: "Logística Flex" },
            { id: "colecta", icon: "📦", label: "Colecta" },
            { id: "dashboard", icon: "📊", label: "Dashboard" },
            { id: "zoneConfig", icon: "⚙️", label: "Config. Zonas" },
            { id: "carrierView", icon: "🚛", label: "Transportistas" },
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
                <span className="nav-icon">{link.icon}</span>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="main-content">
        <header className="topbar">
          <div className="period-picker">
            {activeTab === 'dashboard' && (
              <>
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    className={`period-tab ${period === p.id ? 'active' : ''}`}
                    onClick={() => setPeriod(p.id)}
                    title={p.label}
                  >
                    <span className="period-icon">{p.icon}</span>
                    <span className="period-label">{p.label}</span>
                  </button>
                ))}

                {period === 'date' && (
                  <input
                    type="date"
                    className="form-input date-input"
                    value={specificDate}
                    onChange={(e) => setSpecificDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                )}
              </>
            )}
          </div>

          <div className="user-profile">
            <div className="avatar">A</div>
            <span>Admin</span>
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
