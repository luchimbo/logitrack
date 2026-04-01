"use client";

import { useEffect, useState } from "react";
import UploadSection from "@/components/UploadSection";
import ZoneConfig from "@/components/ZoneConfig";
import FlexSection from "@/components/FlexSection";
import ColectaSection from "@/components/ColectaSection";
import PickingList from "@/components/PickingList";
import CarrierView from "@/components/CarrierView";
import Dashboard from "@/components/Dashboard";
import MapSection from "@/components/MapSection";
import UserManagementSection from "@/components/UserManagementSection";
import { useBatch } from "@/components/BatchContext";

const PERIODS = [
  { id: 'today', label: 'Hoy', icon: '📅' },
  { id: 'date', label: 'Fecha', icon: '🗓️' },
  { id: 'range', label: 'Rango', icon: '🧭' },
  { id: 'week', label: 'Semana', icon: '📆' },
  { id: 'month', label: 'Mes', icon: '📊' },
  { id: 'year', label: 'Año', icon: '📈' },
  { id: 'all', label: 'Todo', icon: '🗃️' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("upload");
  const [currentUser, setCurrentUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { period, setPeriod, specificDate, setSpecificDate, rangeFrom, setRangeFrom, rangeTo, setRangeTo } = useBatch();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        setCurrentUser(data.user || null);
      } catch {
        setCurrentUser(null);
      }
    };

    loadUser();
  }, []);

  // Close sidebar when clicking outside or pressing escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    
    if (sidebarOpen) {
      document.body.classList.add('sidebar-open');
      window.addEventListener('keydown', handleEscape);
    } else {
      document.body.classList.remove('sidebar-open');
    }
    
    return () => {
      document.body.classList.remove('sidebar-open');
      window.removeEventListener('keydown', handleEscape);
    };
  }, [sidebarOpen]);

  const isAdmin = currentUser?.role === "admin";

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  const handleNavClick = (tabId) => {
    setActiveTab(tabId);
    setSidebarOpen(false); // Close sidebar on mobile after navigation
  };

  const renderSection = () => {
    switch (activeTab) {
      case "upload": return <UploadSection />;
      case "pickingList": return <PickingList />;
      case "flex": return <FlexSection />;
      case "colecta": return <ColectaSection />;
      case "zoneConfig": return <ZoneConfig />;
      case "carrierView": return <CarrierView />;
      case "dashboard": return <Dashboard />;
      case "map": return <MapSection />;
      case "userManagement": return isAdmin ? <UserManagementSection /> : <div>No autorizado</div>;
      default: return <div>Página no encontrada</div>;
    }
  };

  const navLinks = [
    { id: "upload", icon: "📦", label: "Subir Etiquetas" },
    { id: "pickingList", icon: "📋", label: "Lista de Picking" },
    { id: "flex", icon: "🚀", label: "Logística Flex" },
    { id: "colecta", icon: "📦", label: "Colecta" },
    { id: "map", icon: "📍", label: "Mapa" },
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "zoneConfig", icon: "⚙️", label: "Config. Zonas" },
    { id: "carrierView", icon: "🚛", label: "Transportistas" },
  ];

  if (isAdmin) {
    navLinks.push({ id: "userManagement", icon: "👤", label: "Usuarios" });
  }

  // Get current section title
  const currentSection = navLinks.find(l => l.id === activeTab);
  const sectionTitle = currentSection?.label || 'LogiTrack';

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>LogiTrack</h2>
          <button 
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>
        <ul className="nav-links">
          {navLinks.map((link) => (
            <li key={link.id}>
              <a
                href="#"
                className={`nav-link ${activeTab === link.id ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(link.id);
                }}
              >
                <span className="nav-icon">{link.icon}</span>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        {currentUser && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
            <div className="user-profile" style={{ justifyContent: 'flex-start' }}>
              <div className="avatar">{currentUser.username?.[0]?.toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{currentUser.username}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{currentUser.role}</div>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="btn btn-ghost"
              style={{ 
                width: '100%', 
                marginTop: '12px', 
                justifyContent: 'center',
                padding: '12px',
                fontSize: '13px'
              }}
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </nav>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button 
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <span className="topbar-title">{sectionTitle}</span>
          </div>
          
          <div className="period-picker" style={{ marginLeft: 'auto' }}>
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

                {period === 'range' && (
                  <>
                    <input
                      type="date"
                      className="form-input date-input"
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      title="Desde"
                    />
                    <input
                      type="date"
                      className="form-input date-input"
                      value={rangeTo}
                      onChange={(e) => setRangeTo(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      title="Hasta"
                    />
                  </>
                )}
              </>
            )}
          </div>
        </header>

        <div className="content-area">
          {renderSection()}
        </div>
      </main>
    </>
  );
}
