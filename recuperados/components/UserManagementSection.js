"use client";

import { useEffect, useState } from "react";
import { formatArgentinaDateTime } from "@/lib/dateUtils";

export default function UserManagementSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [assigning, setAssigning] = useState(false);

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

  const handleAssignUser = async (e) => {
    e.preventDefault();
    setAssigning(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo asignar el usuario");
      setSuccess("Usuario asignado al workspace correctamente");
      setInviteEmail("");
      setInviteRole("user");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setAssigning(false);
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
          Los usuarios se registran solos desde <strong>/sign-up</strong>. Si entran directo, crean su propio workspace como owner.
          Si los asignás desde acá, quedan vinculados a este workspace con el rol elegido.
        </p>
      </div>

      <form className="card" style={{ marginBottom: "18px" }} onSubmit={handleAssignUser}>
        <div className="flex-between mb-md" style={{ alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Asignar usuario al workspace</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>El usuario debe haberse registrado antes con Clerk.</p>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={assigning || !inviteEmail.trim()}>
            {assigning ? "Asignando..." : "Asignar"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 160px", gap: "12px" }}>
          <input
            type="email"
            className="form-input"
            placeholder="email@empresa.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select className="form-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>
        </div>
      </form>

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
                    <span className="mobile-card-value">{u.created_at ? formatArgentinaDateTime(u.created_at) : "-"}</span>
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
