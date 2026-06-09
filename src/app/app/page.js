"use client";

import { useEffect, useState } from "react";
import { useClerk, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useConnectedProviders } from "@/hooks/useConnectedProviders";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { buildAppNavigation } from "@/lib/appNavigation";
import AppSectionRenderer from "@/components/AppSectionRenderer";
import AppShell from "@/components/AppShell";
import OnboardingTour from "@/components/OnboardingTour";

export default function AppHome() {
  const { signOut } = useClerk();
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "upload";
    return new URLSearchParams(window.location.search).get("tab") || "upload";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navBadges, setNavBadges] = useState({});

  const handleBadgeUpdate = (key, count) => {
    setNavBadges((prev) => count > 0 ? { ...prev, [key]: count } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  };
  const { currentUser, setCurrentUser, authChecked, authError, showOnboarding, markOnboardingClosed } = useCurrentUser({ isLoaded, isSignedIn, router });
  const connectedProviders = useConnectedProviders(currentUser);

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

  const canManageWorkspace = currentUser?.isGlobalAdmin || ["owner", "admin"].includes(currentUser?.role);
  const canManageUsers = canManageWorkspace;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      await signOut();
      window.location.assign('/login');
    } catch (err) {
      console.error("Logout error", err);
      window.location.assign('/login');
    }
  };

  const handleNavClick = (tabId) => {
    setActiveTab(tabId);
    setSidebarOpen(false);
  };

  const handleOnboardingClose = markOnboardingClosed;

  const navGroups = buildAppNavigation({ currentUser, canManageUsers, connectedProviders });

  const navLinks = navGroups.flatMap((group) => group.items);
  const currentSection = navLinks.find(l => l.id === activeTab);
  const sectionTitle = currentSection?.label || 'GeoModi';

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
    if (isSignedIn) {
      return (
        <main className="main-content" style={{ marginLeft: 0 }}>
          <div className="content-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'var(--text)', marginBottom: '8px' }}>Error de autenticación</h2>
              <p style={{ color: 'var(--text-muted)' }}>No se pudo sincronizar tu cuenta. Intentá de nuevo.</p>
              {authError && (
                <div style={{ 
                  color: 'var(--danger)', 
                  fontSize: '12px', 
                  marginTop: '8px',
                  padding: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '4px',
                  maxWidth: '400px',
                  wordBreak: 'break-word'
                }}>
                  <strong>Error técnico:</strong><br/>
                  {authError}
                </div>
              )}
            </div>
            <button 
              onClick={handleLogout}
              className="btn btn-primary"
            >
              Cerrar sesión e intentar de nuevo
            </button>
          </div>
        </main>
      );
    }
    return null;
  }

  return (
    <>
      {showOnboarding && <OnboardingTour activeTab={activeTab} onClose={handleOnboardingClose} onNavigate={handleNavClick} />}
      <AppShell
        activeTab={activeTab}
        currentUser={currentUser}
        navBadges={navBadges}
        navGroups={navGroups}
        onCloseSidebar={() => setSidebarOpen(false)}
        onLogout={handleLogout}
        onNavigate={handleNavClick}
        onOpenSidebar={() => setSidebarOpen(true)}
        sectionTitle={sectionTitle}
        sidebarOpen={sidebarOpen}
      >
        <AppSectionRenderer
          activeTab={activeTab}
          canManageUsers={canManageUsers}
          currentUser={currentUser}
          onBadgeUpdate={handleBadgeUpdate}
          onNavigate={handleNavClick}
        />
      </AppShell>
    </>
  );
}
