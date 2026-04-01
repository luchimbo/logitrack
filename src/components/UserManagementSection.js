"use client";

import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";

export default function UserManagementSection() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resettingUser, setResettingUser] = useState("");
  const [resetPasswords, setResetPasswords] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const isMobile = useIsMobile();

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/auth/users");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo cargar usuarios");
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo crear el usuario");
      }

      setSuccess(`Usuario ${data.user.username} creado correctamente`);
      setUsername("");
      setPassword("");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (targetUsername) => {
    const newPassword = (resetPasswords[targetUsername] || "").trim();
    if (newPassword.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }

    setError("");
    setSuccess("");
    setResettingUser(targetUsername);

    try {
      const res = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo resetear contraseña");
      }

      setResetPasswords((prev) => ({ ...prev, [targetUsername]: "" }));
      setSuccess(`Contraseña actualizada para ${targetUsername}`);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setResettingUser("");
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Gestión de Usuarios</h2>
        <p className="section-subtitle">Solo la cuenta admin puede crear usuarios nuevos.</p>
      </div>

      <div className="card" style={{ maxWidth: "520px" }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "14px" }}>
          <div>
            <label className="form-label">Usuario</label>
            <input
              type="text"
              required
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej: operador_1"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              required
              minLength={6}
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>

          {error ? (
            <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 600 }}>
              {error}
            </div>
          ) : null}

          {success ? (
            <div style={{ background: "var(--success-bg)", color: "var(--success)", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 600 }}>
              {success}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Creando..." : "Crear usuario"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: "18px" }}>
        <div className="flex-between mb-md">
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Usuarios existentes</h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={loadUsers} disabled={loadingUsers}>
            {loadingUsers ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {loadingUsers ? (
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Cargando usuarios...</p>
        ) : users.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No hay usuarios todavía.</p>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Creado</th>
                    <th>Nueva contraseña</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id || u.username}>
                      <td>{u.username}</td>
                      <td>{u.role || "user"}</td>
                      <td>{u.created_at ? new Date(u.created_at).toLocaleString("es-AR") : "-"}</td>
                      <td style={{ minWidth: "220px" }}>
                        <input
                          type="password"
                          minLength={6}
                          className="form-input"
                          placeholder="Mínimo 6 caracteres"
                          value={resetPasswords[u.username] || ""}
                          onChange={(e) =>
                            setResetPasswords((prev) => ({
                              ...prev,
                              [u.username]: e.target.value,
                            }))
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => handleResetPassword(u.username)}
                          disabled={resettingUser === u.username}
                        >
                          {resettingUser === u.username ? "Guardando..." : "Resetear"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="mobile-cards-container">
              {users.map((u) => (
                <div key={u.id || u.username} className="mobile-card">
                  <div className="mobile-card-header">
                    <div className="mobile-card-title">{u.username}</div>
                    <span className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                      {u.role || "user"}
                    </span>
                  </div>
                  <div className="mobile-card-body">
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Creado</span>
                      <span className="mobile-card-value">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "-"}
                      </span>
                    </div>
                    <div className="mobile-card-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
                      <span className="mobile-card-label">Nueva contraseña</span>
                      <input
                        type="password"
                        minLength={6}
                        className="form-input"
                        placeholder="Mínimo 6 caracteres"
                        value={resetPasswords[u.username] || ""}
                        onChange={(e) =>
                          setResetPasswords((prev) => ({
                            ...prev,
                            [u.username]: e.target.value,
                          }))
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                  <div className="mobile-card-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => handleResetPassword(u.username)}
                      disabled={resettingUser === u.username}
                    >
                      {resettingUser === u.username ? "Guardando..." : "Resetear contraseña"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
