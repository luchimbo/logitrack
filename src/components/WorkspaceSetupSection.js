"use client";

import InfoDisclosure from "./InfoDisclosure";
import SectionTitle from "./SectionTitle";

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
          syncToken: data.workspace?.slug === 'legacy' ? (data.printer.sync_token || '') : '',
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
        <SectionTitle icon="print">Configuración de impresión</SectionTitle>
        <p className="section-subtitle">Elegí la impresora compartida y configurá la conexión con el agente de impresión V2.</p>
      </div>

      {error ? <div role="alert" className="card" style={{ marginBottom: '18px', color: 'var(--danger)' }}>{error}</div> : null}
      {message ? <div role="status" className="card" style={{ marginBottom: '18px', color: 'var(--success)' }}>{message}</div> : null}

      <InfoDisclosure title="Preparar la PC de impresión" description={workspace?.name || "Mi espacio"} className="card" style={{ marginBottom: '18px' }}>
        <ol className="printer-setup-steps">
          <li>Compartí la impresora Zebra en Windows.</li>
          <li>Copiá los datos de este espacio a <code>print-agent/config.json</code>.</li>
          <li>Ejecutá <code>diagnostico-impresora-v2.bat</code> en la PC de impresión.</li>
        </ol>
      </InfoDisclosure>

      <InfoDisclosure title="Configuración de la impresora" description="Impresora y conexión con el agente local" className="card" style={{ maxWidth: '760px' }}>
        <form onSubmit={handleSave} className="printer-setup-form">
          <div>
            <label className="form-label" htmlFor="printer-name">Nombre visible</label>
            <input id="printer-name" className="form-input" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </div>

          <div>
            <label className="form-label" htmlFor="printer-path">Ruta de la impresora</label>
            <input id="printer-path" className="form-input" value={form.printerPath} onChange={(e) => setForm((prev) => ({ ...prev, printerPath: e.target.value }))} placeholder="\\127.0.0.1\ZDesigner ZD420-203dpi ZPL" />
          </div>

          <div>
            <label className="form-label" htmlFor="printer-sync-url">URL de sincronización</label>
            <input id="printer-sync-url" className="form-input" value={form.syncUrl} onChange={(e) => setForm((prev) => ({ ...prev, syncUrl: e.target.value }))} placeholder="https://tu-dominio/api/v2/print-jobs/intake" />
          </div>

          {workspace?.slug === 'legacy' ? (
            <div>
              <label className="form-label" htmlFor="printer-sync-token">Token del agente</label>
              <input id="printer-sync-token" className="form-input" value={form.syncToken} onChange={(e) => setForm((prev) => ({ ...prev, syncToken: e.target.value }))} placeholder="Token del agente de impresión" />
            </div>
          ) : null}

          <div>
            <label className="form-label" htmlFor="printer-workspace-key">Clave del espacio</label>
            <input id="printer-workspace-key" className="form-input" value={form.workspaceKey} onChange={(e) => setForm((prev) => ({ ...prev, workspaceKey: e.target.value }))} placeholder="Se genera automáticamente si lo dejás vacío" />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading || saving}>
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </form>
      </InfoDisclosure>
    </section>
  );
}
