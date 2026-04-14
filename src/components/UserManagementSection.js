"use client";

import { useEffect, useState } from "react";

export default function UserManagementSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar usuarios");
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (membershipId, role) => {
    setSavingId(String(membershipId));
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar el rol");
      setSuccess("Rol actualizado correctamente");
      setUsers((prev) => prev.map((user) => user.id === membershipId ? { ...user, role } : user));
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setSavingId("");
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Gestión de Usuarios</h2>
        <p className="section-subtitle">Registro libre por email con Clerk. Acá solo se gestionan los roles del workspace actual.</p>
      </div>

      <div className="card" style={{ marginBottom: "18px" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.7 }}>
          Los usuarios se registran solos desde <strong>/sign-up</strong>. Cada cuenta nueva crea su propio workspace <strong>Mi espacio</strong>.
          Este panel administra el rol local dentro del workspace activo. El acceso legacy por <strong>/admin-login</strong> se mantiene solo para administraciÃ³n restringida y debe configurarse manualmente.
        </p>
      </div>

      {error ? <div className="card" style={{ marginBottom: "12px", background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div> : null}
      {success ? <div className="card" style={{ marginBottom: "12px", background: "var(--success-bg)", color: "var(--success)" }}>{success}</div> : null}

      <div className="card">
        <div className="flex-between mb-md">
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Miembros del workspace</h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={loadUsers} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Cargando usuarios...</p>
        ) : users.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Todavía no hay usuarios registrados en este workspace.</p>
        ) : (
          <div className="mobile-cards-container" style={{ display: "grid", gap: "12px" }}>
            {users.map((u) => (
              <div key={u.id} className="mobile-card" style={{ display: "block" }}>
                <div className="mobile-card-header">
                  <div className="mobile-card-title">{u.email}</div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Clerk ID</span>
                    <span className="mobile-card-value">{u.clerk_user_id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Creado</span>
                    <span className="mobile-card-value">{u.created_at ? new Date(u.created_at).toLocaleString("es-AR") : "-"}</span>
                  </div>
                  <div className="mobile-card-row" style={{ alignItems: "center" }}>
                    <span className="mobile-card-label">Rol</span>
                    <select
                      className="form-select"
                      value={u.role || "user"}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={savingId === String(u.id)}
                      style={{ maxWidth: "160px" }}
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
