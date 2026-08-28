"use client";

import { useEffect, useState } from "react";
import { formatArgentinaDateTime } from "@/lib/dateUtils";

export default function UserManagementSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [adding, setAdding] = useState(false);

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

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAdding(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo agregar el usuario");
      setSuccess("Usuario agregado. Se activará cuando se registre con ese email en /sign-up");
      setNewEmail("");
      setNewRole("user");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Gestión de Usuarios</h2>
        <p className="section-subtitle">
          Agregá usuarios por email y gestioná sus roles. Admin puede modificar; user tiene acceso de solo lectura.
        </p>
      </div>

      <div className="card" style={{ marginBottom: "18px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Agregar usuario</h3>
        <form onSubmit={handleAddUser} style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", alignItems: "end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label className="mobile-card-label" htmlFor="add-user-email">Email</label>
            <input
              id="add-user-email"
              className="form-input"
              type="email"
              required
              placeholder="usuario@empresa.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label className="mobile-card-label" htmlFor="add-user-role">Rol</label>
            <select
              id="add-user-role"
              className="form-select"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              <option value="admin">admin</option>
              <option value="user">user</option>
            </select>
          </div>
          <button type="submit" className="btn" disabled={adding}>
            {adding ? "Agregando..." : "Agregar"}
          </button>
        </form>
        <p style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "10px", lineHeight: 1.6 }}>
          El vínculo se activa cuando la persona se registra en <strong>/sign-up</strong> con ese email.
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
                  <div className="mobile-card-title">
                    {u.email}
                    {u.is_pending ? (
                      <span className="badge" style={{ marginLeft: "8px", background: "var(--text-muted)", color: "var(--bg)", fontSize: "11px", padding: "2px 8px", borderRadius: "999px" }}>
                        Pendiente de registro
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Creado</span>
                    <span className="mobile-card-value">{u.created_at ? formatArgentinaDateTime(u.created_at) : "-"}</span>
                  </div>
                  <div className="mobile-card-row" style={{ alignItems: "center" }}>
                    <span className="mobile-card-label">Rol</span>
                    <select
                      className="form-select"
                      value={u.role === "owner" ? "admin" : (u.role || "user")}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={savingId === String(u.id)}
                      style={{ maxWidth: "160px" }}
                    >
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
