"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useConnectedProviders } from "@/hooks/useConnectedProviders";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { buildAppNavigation, buildMobileNavigation, resolveAppTab } from "@/lib/appNavigation";
import AppSectionRenderer from "@/components/AppSectionRenderer";
import AppShell from "@/components/AppShell";
import OnboardingTour from "@/components/OnboardingTour";
import { useSettlementJobs } from "@/hooks/useSettlementJobs";

export default function AppHome() {
  const { signOut } = useClerk();
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "operationToday";
    return new URLSearchParams(window.location.search).get("tab") || "operationToday";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navBadges, setNavBadges] = useState({});
  const scrollPositions = useRef(new Map());

  const handleBadgeUpdate = useCallback((key, count) => {
    setNavBadges((prev) => count > 0 ? { ...prev, [key]: count } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  }, []);
  const { currentUser, setCurrentUser, authChecked, authError, authErrorCode, showOnboarding, markOnboardingClosed } = useCurrentUser({ isLoaded, isSignedIn, router });
  const connectedProviders = useConnectedProviders(currentUser);
  const workspaceSlug = currentUser?.workspaceSlug;

  // Auto-polling for Google Sheets shipments (GeoModi only)
  // Syncs every 5 minutes and updates the sidebar badge automatically
  useEffect(() => {
    if (workspaceSlug !== 'legacy') return;

    const syncAndUpdateBadge = async () => {
      try {
        // First sync from Google Sheets to get latest entries
        await fetch('/api/cron/sheets-sync', { method: 'GET' });
        // Then fetch badge count
        const res = await fetch('/api/shipments/sheet?status=pending');
        if (res.ok) {
          const data = await res.json();
          if (data.pendingCount !== undefined) {
            handleBadgeUpdate('sheetSync', data.pendingCount);
          }
        }
      } catch (e) {
        // Silent fail - don't disrupt the user
      }
    };

    // Run immediately on load
    syncAndUpdateBadge();

    // Then every 5 minutes
    const interval = setInterval(syncAndUpdateBadge, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [workspaceSlug, handleBadgeUpdate]);

  const canManageWorkspace = currentUser?.isGlobalAdmin || ["owner", "admin"].includes(currentUser?.role);
  useSettlementJobs(Boolean(currentUser?.workspaceId) && canManageWorkspace);
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

  const closeMobileNavigation = useCallback(() => setSidebarOpen(false), []);
  const openMobileNavigation = useCallback(() => setSidebarOpen(true), []);

  const navGroups = useMemo(
    () => buildAppNavigation({ currentUser, canManageUsers, connectedProviders }),
    [currentUser, canManageUsers, connectedProviders],
  );
  const effectiveActiveTab = resolveAppTab({ requestedTab: activeTab, currentUser, navGroups });
  const mobileNavigation = useMemo(
    () => buildMobileNavigation({ currentUser, navGroups }),
    [currentUser, navGroups],
  );

  const syncTabUrl = useCallback((tabId, { replace = false } = {}) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabId);
    window.history[replace ? "replaceState" : "pushState"]({ tab: tabId }, "", url);
  }, []);

  const handleNavClick = useCallback((tabId, options = {}) => {
    const nextTab = resolveAppTab({ requestedTab: tabId, currentUser, navGroups });
    if (typeof window !== "undefined") scrollPositions.current.set(activeTab, window.scrollY);
    setActiveTab(nextTab);
    setSidebarOpen(false);
    if (typeof window !== "undefined" && nextTab !== activeTab) {
      syncTabUrl(nextTab, options);
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.get(nextTab) || 0 }));
    }
  }, [activeTab, currentUser, navGroups, syncTabUrl]);

  useEffect(() => {
    if (!currentUser || !navGroups.length) return;
    if (activeTab !== effectiveActiveTab) {
      syncTabUrl(effectiveActiveTab, { replace: true });
    }
  }, [activeTab, currentUser, effectiveActiveTab, navGroups.length, syncTabUrl]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const handlePopState = () => {
      const requestedTab = new URLSearchParams(window.location.search).get("tab");
      const nextTab = resolveAppTab({ requestedTab, currentUser, navGroups });
      scrollPositions.current.set(activeTab, window.scrollY);
      setActiveTab(nextTab);
      setSidebarOpen(false);
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.get(nextTab) || 0 }));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeTab, currentUser, navGroups]);

  const handleOnboardingClose = markOnboardingClosed;

  const navLinks = navGroups.flatMap((group) => group.items);
  const currentSection = navLinks.find(l => l.id === effectiveActiveTab);
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
      const serviceError = authErrorCode === "DATABASE_UNAVAILABLE" || authErrorCode === "SERVER_ERROR";
      return (
        <main className="main-content" style={{ marginLeft: 0 }}>
          <div className="content-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'var(--text)', marginBottom: '8px' }}>{serviceError ? 'Servicio temporalmente no disponible' : 'Error de autenticación'}</h2>
              <p style={{ color: 'var(--text-muted)' }}>{serviceError ? 'Tu sesión está activa, pero no se pudo cargar tu cuenta.' : 'No se pudo sincronizar tu cuenta. Intentá de nuevo.'}</p>
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
              onClick={serviceError ? () => window.location.reload() : handleLogout}
              className="btn btn-primary"
            >
              {serviceError ? 'Volver a intentar' : 'Cerrar sesión e intentar de nuevo'}
            </button>
          </div>
        </main>
      );
    }
    return null;
  }

  return (
    <>
      {showOnboarding && <OnboardingTour activeTab={effectiveActiveTab} onClose={handleOnboardingClose} onNavigate={handleNavClick} />}
      <AppShell
        activeTab={effectiveActiveTab}
        currentUser={currentUser}
        navBadges={navBadges}
        navGroups={navGroups}
        mobileNavigation={mobileNavigation}
        onCloseSidebar={closeMobileNavigation}
        onLogout={handleLogout}
        onNavigate={handleNavClick}
        onOpenSidebar={openMobileNavigation}
        sectionTitle={sectionTitle}
        sidebarOpen={sidebarOpen}
      >
        <AppSectionRenderer
          activeTab={effectiveActiveTab}
          canManageUsers={canManageUsers}
          currentUser={currentUser}
          onBadgeUpdate={handleBadgeUpdate}
          onNavigate={handleNavClick}
        />
      </AppShell>
    </>
  );
}
