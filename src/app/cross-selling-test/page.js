'use client';
import { useState } from 'react';
import StorefrontModule from './StorefrontModule';

export default function CrossSellingTest() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cartId, setCartId] = useState('');
  const [triggerVariant, setTrigger] = useState('');
  const [accessoryVariant, setAccessory] = useState('');
  async function run(action) {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/tiendanube/cross-selling/probe', action === 'status' ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, cartId, triggerVariant, accessoryVariant }),
      });
      const data = await response.json();
      setResult((previous) => data.error ? { ...previous, error: data.error } : data);
    } catch { setResult((previous) => ({ ...previous, error: 'No se pudo consultar la prueba. Volvé a intentar.' })); }
    finally { setBusy(false); }
  }
  const choices = result?.state?.choices || [];
  return <main style={{ maxWidth: 960, margin: '40px auto', padding: 24, color: '#e2e8f0', background: '#111827', borderRadius: 16 }}>
    <h1>Prueba de cross-selling</h1>
    <p>LogiTrack Prueba · tienda 7570182. Beneficio de $1 en un carrito elegido, por hasta dos horas.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '24px 0' }}>
      <button disabled={busy} onClick={() => run('status')}>Consultar estado</button>
      <button disabled={busy} onClick={() => run('prepare')}>Preparar prueba en demo</button>
      <button disabled={busy} onClick={() => run('revoke')}>Retirar aceptación</button>
      <button disabled={busy} onClick={() => run('disable')}>Desactivar prueba</button>
    </div>
    <form onSubmit={(e) => { e.preventDefault(); run('accept'); }} style={{ display: 'grid', gap: 16 }}>
      <label htmlFor="probe-cart">Carrito confirmado por Tiendanube</label><input id="probe-cart" required value={cartId} onChange={(e) => setCartId(e.target.value)} />
      <label htmlFor="probe-trigger">Producto principal</label><select id="probe-trigger" required value={triggerVariant} onChange={(e) => setTrigger(e.target.value)}>
        <option value="">Elegí el principal</option>{choices.map((c) => <option key={c.variantId} value={c.variantId}>{c.name} · {c.variantId} · ${c.price}</option>)}
      </select>
      <label htmlFor="probe-accessory">Accesorio</label><select id="probe-accessory" required value={accessoryVariant} onChange={(e) => setAccessory(e.target.value)}>
        <option value="">Elegí el accesorio</option>{choices.map((c) => <option key={c.variantId} value={c.variantId}>{c.name} · {c.variantId} · ${c.price}</option>)}
      </select>
      <button disabled={busy}>Registrar aceptación de prueba</button>
    </form>
    <p role="status">{busy ? 'Procesando…' : result?.error || ''}</p>
    <pre style={{ overflow: 'auto', maxHeight: 600, fontSize: 13, whiteSpace: 'pre-wrap' }}>{result && JSON.stringify(result, null, 2)}</pre>
    <StorefrontModule />
  </main>;
}
