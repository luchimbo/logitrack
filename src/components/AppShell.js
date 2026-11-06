"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import GeoModiLogo from "@/components/GeoModiLogo";
import AppIcon from "@/components/AppIcon";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const COLLAPSED_STORAGE_KEY = "geomodi.sidebarCollapsed";

function NavigationItem({ active, badge, item, onNavigate, variant = "sidebar", compact = false }) {
  const className = variant === "mobile" ? "mobile-bottom-nav-item" : "nav-link";

  return (
    <button
      type="button"
      className={`${className} ${active ? "active" : ""}`}
      onClick={() => onNavigate(item.id)}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      aria-label={compact ? item.label : undefined}
    >
      <span className={variant === "mobile" ? "mobile-bottom-nav-icon" : "nav-icon"}>
        <AppIcon name={item.icon} size={variant === "mobile" ? 21 : 18} />
      </span>
      <span className={variant === "mobile" ? "mobile-bottom-nav-label" : "nav-link-label"}>{item.label}</span>
      {badge > 0 ? <span className="nav-badge" aria-label={`${badge} pendientes`}>{badge}</span> : null}
    </button>
  );
}

export default function AppShell({
  activeTab,
  children,
  currentUser,
  mobileNavigation = { primaryItems: [], moreGroups: [] },
  navBadges = {},
  navGroups,
  onCloseSidebar,
  onLogout,
  onNavigate,
  onOpenSidebar,
  sectionTitle,
  sidebarOpen,
}) {
  const allItems = navGroups.flatMap((group) => group.items);
  const providerLabels = { mercadolibre: "Mercado Libre", tiendanube: "Tiendanube", shopify: "Shopify", zipnova: "Zipnova" };
  if (providerLabels[activeTab] && !allItems.some((item) => item.id === activeTab)) allItems.push({ id: activeTab, label: providerLabels[activeTab], icon: "integrations" });
  const findItems = (ids) => ids.map((id) => allItems.find((item) => item.id === id)).filter(Boolean);
  const sections = [
    { title: "Operación de hoy", icon: "operation", items: findItems(["operationToday", "pickingList", "flex", "colecta", "upload"]) },
    { title: "Seguimiento", icon: "colecta", items: findItems(["deliveryControl", "printJobs"]) },
    { title: "Resultados", icon: "dashboard", items: findItems(["dashboard", "logisticsFinance"]) },
    { title: "Canales", icon: "integrations", items: findItems(["mercadolibre", "tiendanube", "shopify", "zipnova", "integrations"]) },
    { title: "Configuración", icon: "settings", items: findItems(["zoneConfig", "userManagement", "workspaceSetup"]) },
    { title: "Admin Maestro", icon: "settings", items: findItems(["adminOverview"]) },
  ].filter((group) => group.items.length);
  const activeSection = sections.find((group) => group.items.some((item) => item.id === activeTab)) || sections[0];
  const sectionItem = (group) => ({ ...group.items[0], label: group.title, icon: group.icon });
  const groupedMobile = { primaryItems: sections.slice(0, 4).map(sectionItem), moreGroups: sections.slice(4).map((group) => ({ title: group.title, items: [sectionItem(group)] })) };
  const sheetRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const moreIsActive = !sections.slice(0, 4).includes(activeSection);
  const sectionBadge = (group) => group.items.reduce((total, item) => total + Number(navBadges[item.badgeKey] || 0), 0);
  const moreBadgeCount = sections.slice(4).reduce((total, group) => total + sectionBadge(group), 0);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1"); } catch {}
  }, []);

  useEffect(() => {
    // The sidebar width is a root variable: collapsing it also moves the main content.
    document.documentElement.classList.toggle("sidebar-collapsed", collapsed);
    return () => document.documentElement.classList.remove("sidebar-collapsed");
  }, [collapsed]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? "0" : "1"); } catch {}
      return !value;
    });
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("app-content")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const sheet = sheetRef.current;
    const previousFocus = document.activeElement;
    const focusable = sheet?.querySelectorAll(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();
    document.body.classList.add("mobile-nav-open");

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onCloseSidebar();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const items = [...sheet.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("mobile-nav-open");
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onCloseSidebar, sidebarOpen]);

  return (
    <>
      <a className="skip-link" href="#app-content">Saltar al contenido</a>

      <nav className="sidebar" aria-label="Navegación principal">
        <div className="sidebar-header">
          {collapsed ? null : <button type="button" className="sidebar-home" onClick={() => onNavigate("operationToday")} aria-label="Ir al inicio"><GeoModiLogo size="sm" /></button>}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Compactar menú"}
            title={collapsed ? "Expandir menú" : "Compactar menú"}
            aria-expanded={!collapsed}
          >
            <AppIcon name={collapsed ? "expand" : "collapse"} size={18} />
          </button>
        </div>
        <div className="nav-links">
          {sections.map((group) => (
            <div key={group.title} className="nav-group">
              <NavigationItem active={activeSection === group} badge={sectionBadge(group)} item={sectionItem(group)} onNavigate={onNavigate} compact={collapsed} />
            </div>
          ))}
          <a href="/soporte" className="nav-link">Soporte</a>
        </div>
        {currentUser ? (
          <div className="sidebar-account">
            <div className="user-profile">
              <div className="avatar" aria-hidden="true">{currentUser.username?.[0]?.toUpperCase()}</div>
              <div className="user-profile-copy">
                <div>{currentUser.email || currentUser.username}</div>
                <span>{currentUser.role}</span>
              </div>
            </div>
            <button onClick={onLogout} className="btn btn-ghost btn-block" title={collapsed ? "Cerrar sesión" : undefined} aria-label="Cerrar sesión">
              {collapsed ? <AppIcon name="logout" size={18} /> : "Cerrar sesión"}
            </button>
          </div>
        ) : null}
      </nav>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-mobile-mark" aria-hidden="true"><Image src="/icon.png" alt="" width={34} height={34} /></div>
            <div className="topbar-heading">
              <div className="topbar-title">{activeSection?.title || sectionTitle}</div>
              <div className="topbar-user desktop-only">{currentUser?.email || currentUser?.username}</div>
            </div>
          </div>
          <div className="topbar-context desktop-only">
            <span className="topbar-chip subtle">{currentUser?.role || "user"}</span>
          </div>
          {currentUser ? (
            <button onClick={onLogout} className="btn btn-ghost btn-sm desktop-only">Cerrar sesión</button>
          ) : null}
        </header>

        <div className="content-area" id="app-content" tabIndex={-1}>
          {activeSection?.items.length > 1 && <nav aria-label={`Apartados de ${activeSection.title}`} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {activeSection.items.map((item) => <button key={item.id} type="button" className={`btn btn-sm ${activeTab === item.id ? "btn-primary" : "btn-ghost"}`} aria-current={activeTab === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>{item.id === "upload" ? "Subir etiquetas" : item.id === "integrations" ? "Conectar un canal" : item.id === "operationToday" ? "Resumen" : item.label}</button>)}
          </nav>}
          {children}</div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
        {groupedMobile.primaryItems.map((item) => (
          <NavigationItem
            key={item.id}
            active={activeSection?.items.some((entry) => entry.id === item.id)}
            badge={sectionBadge(sections.find((group) => group.items.some((entry) => entry.id === item.id)))}
            item={item}
            onNavigate={onNavigate}
            variant="mobile"
          />
        ))}
        <button
          type="button"
          className={`mobile-bottom-nav-item ${moreIsActive || sidebarOpen ? "active" : ""}`}
          onClick={onOpenSidebar}
          aria-haspopup="dialog"
          aria-expanded={sidebarOpen}
        >
          <span className="mobile-bottom-nav-icon"><AppIcon name="more" size={21} /></span>
          <span className="mobile-bottom-nav-label">Más</span>
          {moreBadgeCount > 0 ? <span className="nav-badge" aria-label={`${moreBadgeCount} pendientes`}>{moreBadgeCount}</span> : null}
        </button>
      </nav>

      <div
        className={`mobile-more-overlay ${sidebarOpen ? "open" : ""}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onCloseSidebar();
        }}
        aria-hidden={!sidebarOpen}
      >
        <section
          ref={sheetRef}
          className="mobile-more-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-more-title"
        >
          <div className="mobile-more-handle" aria-hidden="true" />
          <header className="mobile-more-header">
            <div><p>Tu espacio</p><h2 id="mobile-more-title">Más opciones</h2></div>
            <button type="button" className="icon-button" onClick={onCloseSidebar} aria-label="Cerrar más opciones">
              <AppIcon name="close" size={22} />
            </button>
          </header>

          <div className="mobile-more-content">
            <a href="/soporte" className="nav-link">Soporte</a>
            {groupedMobile.moreGroups.map((group) => (
              <div key={group.title} className="mobile-more-group">
                <h3>{group.title}</h3>
                <div className="mobile-more-list">
                  {group.items.map((item) => (
                    <NavigationItem
                      key={item.id}
                      active={activeTab === item.id}
                      badge={navBadges[item.badgeKey]}
                      item={item}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {currentUser ? (
            <footer className="mobile-more-footer">
              <div className="user-profile">
                <div className="avatar" aria-hidden="true">{currentUser.username?.[0]?.toUpperCase()}</div>
                <div className="user-profile-copy"><div>{currentUser.email || currentUser.username}</div><span>{currentUser.role}</span></div>
              </div>
              <button type="button" className="btn btn-ghost btn-block" onClick={onLogout}>
                <AppIcon name="logout" size={18} />
                Cerrar sesión
              </button>
            </footer>
          ) : null}
        </section>
      </div>
    </>
  );
}
