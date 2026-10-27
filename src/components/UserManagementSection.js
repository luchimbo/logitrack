"use client";

import { useCallback, useEffect, useState } from "react";
import { formatArgentinaDateTime } from "@/lib/dateUtils";

export default function UserManagementSection({ currentUser }) {
  const [workspaceId, setWorkspaceId] = useState(String(currentUser?.workspaceId || ""));
  const [workspace, setWorkspace] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [sendEmail, setSendEmail] = useState(true);
  const [reassignment, setReassignment] = useState(null);

  const loadUsers = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/users${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""}`, { signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los miembros.");
      if (signal?.aborted) return;
      setUsers(data.users || []); setWorkspace(data.workspace); setWorkspaces(data.workspaces || []);
    } catch (err) { if (!signal?.aborted) setError(err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [workspaceId]);
  useEffect(() => { const controller = new AbortController(); loadUsers(controller.signal); return () => controller.abort(); }, [loadUsers]);

  async function post(input) {
    const response = await fetch("/api/auth/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, workspaceId: Number(workspace.id) }), signal: AbortSignal.timeout(30000),
    });
    return { response, data: await response.json() };
  }
  function showDelivery(delivery, fallback) {
    setNotice({ warning: delivery?.status === "failed" || delivery?.status === "cooldown", text: delivery?.message ? `${fallback} ${delivery.message}` : fallback });
  }
  async function assign(event, confirmed = null) {
    event.preventDefault();
    const input = confirmed || { email, role, sendEmail };
    setReassignment(null); setBusy("assign"); setError(""); setNotice(null);
    try {
      const { response, data } = await post({ ...input, reassign: Boolean(confirmed) });
      if (response.status === 409 && data.code === "OTHER_WORKSPACE" && data.canReassign) { setReassignment(input); return; }
      if (!response.ok) throw new Error(data.error || "No se pudo asignar el acceso.");
      showDelivery(data.emailDelivery, `Acceso ${data.updated ? "actualizado" : "asignado"} a ${data.workspaceName}.`);
      setEmail(""); setRole("user"); await loadUsers();
    } catch (err) { setError(err.name === "TimeoutError" ? "La operación está tardando. Actualizá la lista antes de reintentar para comprobar si el acceso quedó asignado." : err.message); }
    finally { setBusy(""); }
  }
  async function resend(user) {
    setBusy(`email:${user.id}`); setError(""); setNotice(null);
    try {
      const { response, data } = await post({ action: "sendAccess", email: user.email });
      if (!response.ok && !data.emailDelivery) throw new Error(data.error || "No se pudo enviar el correo.");
      showDelivery(data.emailDelivery, user.email); await loadUsers();
    } catch (err) { setError(err.name === "TimeoutError" ? "El envío está tardando. Revisá el estado antes de reintentar." : err.message); }
    finally { setBusy(""); }
  }
  async function changeRole(user, nextRole) {
    setBusy(`role:${user.id}`); setError(""); setNotice(null);
    try {
      const response = await fetch("/api/auth/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: user.id, role: nextRole, workspaceId: workspace.id }), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cambiar el rol.");
      setUsers(prev => prev.map(member => member.id === user.id ? { ...member, role: nextRole } : member)); setNotice({ text: "Rol actualizado." });
    } catch (err) { setError(err.message); }
    finally { setBusy(""); }
  }
  return (
    <section className="section workspace-users">
      <div className="section-header"><h2 className="section-title">Espacio y miembros</h2><p className="section-subtitle">Asigná acceso por email, con o sin cuenta creada.</p></div>
      <div className="card destination">
        <label className="eyebrow" htmlFor="members-workspace">Espacio que estás gestionando</label>
        {currentUser?.isGlobalAdmin && workspaces.length > 0 ? <select id="members-workspace" className="form-select" value={workspaceId} disabled={Boolean(busy)} onChange={event => { setWorkspaceId(event.target.value); setReassignment(null); setError(""); setNotice(null); }}>
          {workspaces.map(item => <option key={item.id} value={item.id}>{item.slug === "legacy" ? "GeoModi" : item.name} · {item.owner_email || item.slug} · #{item.id}</option>)}
        </select> : <h3 id="members-workspace">{workspace?.name || "Cargando espacio…"}</h3>}
        <p>Los accesos se asignan a este espacio. Las cuentas existentes conservan su forma de iniciar sesión.</p>
      </div>
      <div className="card assignment"><h3>Asignar acceso</h3><p className="muted">Ingresá el email que la persona usa o usará para entrar a GeoModi.</p>
        <form onSubmit={assign}><div className="assignment-fields">
          <label>Email<input className="form-input" type="email" required autoComplete="off" placeholder="persona@empresa.com" value={email} disabled={Boolean(busy) || loading} onChange={event => { setEmail(event.target.value); setReassignment(null); }} /></label>
          <label>Rol<select className="form-select" value={role} disabled={Boolean(busy) || loading} onChange={event => { setRole(event.target.value); setReassignment(null); }}><option value="user">Usuario</option><option value="admin">Administrador</option></select></label>
        </div>
          <label className="email-choice"><input type="checkbox" checked={sendEmail} disabled={Boolean(busy) || loading} onChange={event => { setSendEmail(event.target.checked); setReassignment(null); }} />Enviar correo con el acceso</label>
          <p className="muted">Si ya tiene cuenta, podrá iniciar sesión. Si todavía no tiene cuenta, podrá registrarse con ese email y entrar al espacio asignado.</p>
          <button className="btn" type="submit" disabled={Boolean(busy) || loading || !workspace}>{busy === "assign" ? "Asignando acceso…" : sendEmail ? "Asignar y enviar acceso" : "Asignar acceso"}</button>
        </form>
      </div>
      {reassignment && <div className="card confirmation" role="alert"><h3>Esta persona ya pertenece a otro espacio</h3><p><strong>{reassignment.email}</strong> pasará a <strong>{workspace?.name}</strong> y perderá acceso a sus espacios anteriores. Sus datos se conservarán.</p>
        <div className="actions"><button className="btn" disabled={Boolean(busy)} onClick={event => assign(event, reassignment)}>{reassignment.sendEmail ? "Reasignar y enviar acceso" : "Reasignar acceso"}</button><button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setReassignment(null)}>Cancelar</button></div>
      </div>}
      {error && <div className="card message error" role="alert">{error}</div>}
      {notice && <div className={`card message ${notice.warning ? "warning" : "success"}`} role="status">{notice.text}</div>}
      <div className="card members"><div className="flex-between"><h3>Miembros de {workspace?.name || "este espacio"}</h3><button className="btn btn-sm btn-ghost" disabled={loading || Boolean(busy)} onClick={() => { setError(""); loadUsers(); }}>{loading ? "Cargando…" : "Actualizar"}</button></div>
        {loading ? <p className="muted">Cargando miembros…</p> : users.length === 0 ? <p className="muted">Todavía no hay miembros. Asigná el primer acceso desde el formulario.</p> : <ul className="member-list">{users.map(user => <li className="member" key={user.id}>
          <div className="member-identity"><strong>{user.email}</strong><span className={`account-state ${user.is_pending ? "pending" : "active"}`}>{user.is_pending ? "Pendiente de ingreso" : "Cuenta vinculada"}</span>
            <span className="muted">{user.email_status === "sent" ? `Correo enviado ${formatArgentinaDateTime(user.email_sent_at)}` : user.email_status === "failed" ? "No se pudo enviar el correo. El acceso sigue asignado." : user.email_status === "sending" ? "Envío en curso…" : "Sin correo de acceso enviado"}</span>
          </div>
          <div className="member-controls"><label className="sr-only" htmlFor={`member-role-${user.id}`}>Rol de {user.email}</label><select id={`member-role-${user.id}`} className="form-select" value={user.role} disabled={user.role === "owner" || Boolean(busy)} onChange={event => changeRole(user, event.target.value)}>
            {user.role === "owner" && <option value="owner">Propietario</option>}<option value="admin">Administrador</option><option value="user">Usuario</option>
          </select><button className="btn btn-sm btn-ghost" disabled={Boolean(busy)} onClick={() => resend(user)}>{busy === `email:${user.id}` ? "Enviando…" : user.email_sent_at ? "Reenviar acceso" : "Enviar acceso"}</button></div>
        </li>)}</ul>}
      </div>
      <style jsx>{`
        .workspace-users{max-width:1080px}.workspace-users h3{font-size:16px;font-weight:700;margin:0}.destination,.assignment,.members,.confirmation{margin-bottom:18px}
        .destination{border-left:3px solid var(--accent);display:grid;gap:10px}.destination .form-select{max-width:650px}.eyebrow{text-transform:uppercase;font-size:11px;letter-spacing:.1em;font-weight:700;color:var(--text-muted)}
        .destination p,.muted{font-size:13px;color:var(--text-muted);line-height:1.6;margin:0}.assignment>p{margin:8px 0 20px}.assignment-fields{display:grid;grid-template-columns:2fr 1fr;gap:16px}.assignment-fields label{display:grid;gap:8px;font-size:13px;font-weight:600}
        .email-choice{display:flex;align-items:center;gap:9px;margin-top:18px;font-size:13px}.email-choice input{accent-color:var(--accent);width:16px;height:16px}.assignment form>p{margin:8px 0 18px;max-width:650px}
        .member-list{list-style:none;padding:0;margin:14px 0 0}.member{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:18px 0;border-top:1px solid var(--border)}.member-identity{display:flex;align-items:flex-start;flex-direction:column;gap:7px;min-width:0}.member-identity strong{font-size:14px;overflow-wrap:anywhere}.member-controls{display:flex;align-items:center;gap:12px;flex-shrink:0}.member-controls select{max-width:180px}.member-controls button{white-space:nowrap}
        .account-state{font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px}.active{background:var(--success-bg);color:var(--success)}.pending{background:var(--bg-secondary);color:var(--text-muted)}.message{margin-bottom:18px;font-size:14px}.error{background:var(--danger-bg);color:var(--danger)}.success{background:var(--success-bg);color:var(--success)}.warning,.confirmation{border-left:3px solid var(--accent)}.confirmation p{font-size:14px;line-height:1.7;margin:12px 0}.actions{display:flex;gap:10px;flex-wrap:wrap}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        @media(max-width:650px){.assignment-fields{grid-template-columns:1fr}.member{align-items:stretch;flex-direction:column}.member-controls{justify-content:space-between;gap:8px}.member-controls select{max-width:55%}.destination .form-select{width:100%}}
      `}</style>
    </section>
  );
}
