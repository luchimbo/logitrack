"use client";

import GeoModiLogo from "@/components/GeoModiLogo";

export default function AppShell({
  activeTab,
  children,
  currentUser,
  navBadges = {},
  navGroups,
  onCloseSidebar,
  onLogout,
  onNavigate,
  onOpenSidebar,
  sectionTitle,
  sidebarOpen,
}) {
  return (
    <>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={onCloseSidebar}
      />

      <nav
        className={`sidebar ${sidebarOpen ? 'open' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sidebar-header">
          <GeoModiLogo size="sm" />
          <button
            className="sidebar-close-btn"
            onClick={onCloseSidebar}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>
        <div className="nav-links">
          {navGroups.map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-group-title">{group.title}</div>
              <ul className="nav-group-list">
                {group.items.map((link) => (
                  <li key={link.id}>
                    <a
                      href="#"
                      className={`nav-link ${activeTab === link.id ? "active" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(link.id);
                      }}
                    >
                      <span className="nav-icon">{link.icon}</span>
                      <span style={{ flex: 1 }}>{link.label}</span>
                      {link.badgeKey && navBadges[link.badgeKey] > 0 && (
                        <span style={{
                          background: '#f97316',
                          color: '#fff',
                          borderRadius: '999px',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          lineHeight: 1.4,
                          minWidth: '18px',
                          textAlign: 'center',
                        }}>
                          {navBadges[link.badgeKey]}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {currentUser && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
            <div className="user-profile" style={{ justifyContent: 'flex-start', marginBottom: '16px' }}>
              <div className="avatar">{currentUser.username?.[0]?.toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{currentUser.email || currentUser.username}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {currentUser.role}
                </div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="btn btn-ghost"
              style={{
                width: '100%',
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
              onClick={onOpenSidebar}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <div>
              <div className="topbar-title">{sectionTitle}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }} className="desktop-only">
                {currentUser?.email || currentUser?.username}
              </div>
            </div>
          </div>
          <div className="topbar-context desktop-only">
            <span className="topbar-chip subtle">{currentUser?.role || 'user'}</span>
          </div>
          {currentUser && (
            <button
              onClick={onLogout}
              className="btn btn-ghost btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              Cerrar sesión
            </button>
          )}
        </header>

        <div className="content-area">
          {children}
        </div>
      </main>
    </>
  );
}
