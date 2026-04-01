"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import UploadSection from "@/components/UploadSection";
import ZoneConfig from "@/components/ZoneConfig";
import FlexSection from "@/components/FlexSection";
import ColectaSection from "@/components/ColectaSection";
import PickingList from "@/components/PickingList";
import CarrierView from "@/components/CarrierView";
import Dashboard from "@/components/Dashboard";
import MapSection from "@/components/MapSection";
import UserManagementSection from "@/components/UserManagementSection";

export default function Home() {
  const { signOut } = useClerk();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("upload");
  const [currentUser, setCurrentUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          setCurrentUser(null);
          setAuthChecked(true);
          router.replace("/login");
          return;
        }
        const data = await res.json();
        setCurrentUser(data.user || null);
        setAuthChecked(true);
      } catch {
        setCurrentUser(null);
        setAuthChecked(true);
        router.replace("/login");
      }
    };

    loadUser();
  }, [router]);

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
  const canManageWorkspace = currentUser?.isGlobalAdmin || ["owner", "admin"].includes(currentUser?.role);
  const canManageUsers = canManageWorkspace;

  const handleLogout = async () => {
    const isClerkUser = currentUser?.authType === "clerk";

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);

      if (isClerkUser) {
        await signOut();
        window.location.assign('/login');
        return;
      }

      window.location.assign('/admin-login');
    } catch (err) {
      console.error("Logout error", err);
      window.location.assign(isClerkUser ? '/login' : '/admin-login');
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
      case "userManagement": return canManageUsers ? <UserManagementSection /> : <div>No autorizado</div>;
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

  if (canManageUsers) {
    navLinks.push({ id: "userManagement", icon: "👤", label: "Usuarios" });
  }

  // Get current section title
  const currentSection = navLinks.find(l => l.id === activeTab);
  const sectionTitle = currentSection?.label || 'LogiTrack';

  if (!authChecked) {
    return (
      <main className="main-content" style={{ marginLeft: 0 }}>
        <div className="content-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div className="spinner"></div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return null;
  }

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
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{currentUser.email || currentUser.username}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {currentUser.workspaceName ? `${currentUser.workspaceName} · ` : ''}{currentUser.role}
                </div>
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
          {currentUser && (
            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              Cerrar sesión
            </button>
          )}
        </header>

        <div className="content-area">
          {renderSection()}
        </div>
      </main>
    </>
  );
}
