"use client";

import { useEffect, useState } from "react";

export default function WorkspaceSetupSection() {
  const [form, setForm] = useState({
    name: "Impresora principal",
    printerPath: "",
    syncUrl: "",
    syncToken: "",
    workspaceKey: "",
  });
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch('/api/workspace/setup');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la configuración');
      setWorkspace(data.workspace || null);
      if (data.printer) {
        setForm({
          name: data.printer.name || 'Impresora principal',
          printerPath: data.printer.printer_path || '',
          syncUrl: data.printer.sync_url || '',
          syncToken: data.printer.sync_token || '',
          workspaceKey: data.printer.workspace_key || '',
        });
      }
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch('/api/workspace/setup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      setMessage('Configuración guardada. Ahora configurá la PC de impresión con estos mismos datos y corré el diagnóstico V2.');
      await load();
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Configuración inicial de impresión</h2>
        <p className="section-subtitle">Este setup deja aislada la impresión V2 por workspace y define la impresora compartida de la PC local.</p>
      </div>

      <div className="card" style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <div><strong>Workspace:</strong> {workspace?.name || 'Mi espacio'}</div>
          <div><strong>Qué tenés que hacer en la PC:</strong> compartir la Zebra en Windows, copiar estos datos a `print-agent/config.json` y ejecutar `diagnostico-impresora-v2.bat`.</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '760px' }}>
        <form onSubmit={handleSave} style={{ display: 'grid', gap: '14px' }}>
          <div>
            <label className="form-label">Nombre visible</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </div>

          <div>
            <label className="form-label">printerPath</label>
            <input className="form-input" value={form.printerPath} onChange={(e) => setForm((prev) => ({ ...prev, printerPath: e.target.value }))} placeholder="\\127.0.0.1\ZDesigner ZD420-203dpi ZPL" />
          </div>

          <div>
            <label className="form-label">syncUrl</label>
            <input className="form-input" value={form.syncUrl} onChange={(e) => setForm((prev) => ({ ...prev, syncUrl: e.target.value }))} placeholder="https://tu-dominio/api/v2/print-jobs/intake" />
          </div>

          <div>
            <label className="form-label">syncToken</label>
            <input className="form-input" value={form.syncToken} onChange={(e) => setForm((prev) => ({ ...prev, syncToken: e.target.value }))} placeholder="Token del agente de impresión" />
          </div>

          <div>
            <label className="form-label">workspaceKey</label>
            <input className="form-input" value={form.workspaceKey} onChange={(e) => setForm((prev) => ({ ...prev, workspaceKey: e.target.value }))} placeholder="Se genera automáticamente si lo dejás vacío" />
          </div>

          {error ? <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px', borderRadius: '8px' }}>{error}</div> : null}
          {message ? <div style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '10px', borderRadius: '8px' }}>{message}</div> : null}

          <button type="submit" className="btn btn-primary" disabled={loading || saving}>
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </form>
      </div>
    </section>
  );
}
