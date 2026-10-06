"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import GeoModiLogo from "@/components/GeoModiLogo";
import AppIcon from "@/components/AppIcon";
import { isMobileMoreActive } from "@/lib/appNavigation";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function NavigationItem({ active, badge, item, onNavigate, variant = "sidebar" }) {
  const className = variant === "mobile" ? "mobile-bottom-nav-item" : "nav-link";

  return (
    <button
      type="button"
      className={`${className} ${active ? "active" : ""}`}
      onClick={() => onNavigate(item.id)}
      aria-current={active ? "page" : undefined}
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
  const sheetRef = useRef(null);
  const moreIsActive = isMobileMoreActive({ activeTab, primaryItems: mobileNavigation.primaryItems });
  const moreBadgeCount = mobileNavigation.moreGroups
    .flatMap((group) => group.items)
    .reduce((total, item) => total + Number(navBadges[item.badgeKey] || 0), 0);

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
        <div className="sidebar-header"><GeoModiLogo size="sm" /></div>
        <div className="nav-links">
          {navGroups.map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-group-title">{group.title}</div>
              <ul className="nav-group-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NavigationItem
                      active={activeTab === item.id}
                      badge={navBadges[item.badgeKey]}
                      item={item}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
            <button onClick={onLogout} className="btn btn-ghost btn-block">Cerrar sesión</button>
          </div>
        ) : null}
      </nav>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-mobile-mark" aria-hidden="true"><Image src="/icon.png" alt="" width={34} height={34} /></div>
            <div className="topbar-heading">
              <div className="topbar-title">{sectionTitle}</div>
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

        <div className="content-area" id="app-content" tabIndex={-1}>{children}</div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
        {mobileNavigation.primaryItems.map((item) => (
          <NavigationItem
            key={item.id}
            active={activeTab === item.id}
            badge={navBadges[item.badgeKey]}
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
            {mobileNavigation.moreGroups.map((group) => (
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
