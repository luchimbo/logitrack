'use client';
import { useState } from 'react';

export default function StorefrontModule() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scriptId, setScriptId] = useState('');
  async function run(action) {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/tiendanube/cross-selling/storefront', action === 'status' ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, scriptId }),
      });
      const data = await response.json();
      setResult((previous) => data.error ? { ...previous, error: data.error } : data);
    } catch { setResult((previous) => ({ ...previous, error: 'No se pudo consultar el módulo. Volvé a intentar.' })); }
    finally { setBusy(false); }
  }
  const state = result?.state;
  return <section style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #374151' }}>
    <h2>Completá tu equipo</h2>
    <p>Ofertas de Mostrador en la tienda demo con descuento real al aceptarlas. Reemplaza el callback de la prueba de $1.</p>
    <p>Estado: {state ? (state.enabled ? 'Activo' : 'Desactivado') : 'Sin consultar'}
      {result?.publication ? ` · Reglas publicadas: ${result.publication.selectedRules} · Productos vinculados: ${result.publication.mappedProducts ?? '—'}` : result ? ' · Mostrador no publicó reglas' : ''}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '16px 0' }}>
      <button disabled={busy} onClick={() => run('status')}>Consultar módulo</button>
      <button disabled={busy} onClick={() => run('enable')}>Activar en demo</button>
      <button disabled={busy} onClick={() => run('disable')}>Desactivar</button>
    </div>
    <label htmlFor="cte-script">ID del script en Partners</label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '8px 0 16px' }}>
      <input id="cte-script" inputMode="numeric" value={scriptId} onChange={(e) => setScriptId(e.target.value)} />
      <button disabled={busy || !scriptId} onClick={() => run('install-script')}>Instalar en la demo</button>
      <button disabled={busy || !scriptId} onClick={() => run('uninstall-script')}>Quitar de la demo</button>
    </div>
    <p role="status">{busy ? 'Procesando…' : result?.error || ''}</p>
    <pre style={{ overflow: 'auto', maxHeight: 600, fontSize: 13, whiteSpace: 'pre-wrap' }}>{result && JSON.stringify(result, null, 2)}</pre>
  </section>;
}
