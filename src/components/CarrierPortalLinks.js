"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";

export default function CarrierPortalLinks() {
    const [carriers, setCarriers] = useState([]);
    const [portals, setPortals] = useState({});
    const [portalBusyId, setPortalBusyId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [carriersData, portalsData] = await Promise.all([
                    api('/carriers'),
                    api('/carrier-portals'),
                ]);
                setCarriers(carriersData);
                setPortals(Object.fromEntries((portalsData || []).map((item) => [item.carrier_id, item.portal])));
            } catch (err) {
                toast("Error al cargar links de transportistas", "error");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handlePortalAction = async (carrierId, action) => {
        if (action === 'rotate' && !confirm('El enlace anterior dejará de funcionar. ¿Generar uno nuevo?')) return;
        if (action === 'revoke' && !confirm('El transportista perderá el acceso al portal. ¿Revocar el enlace?')) return;
        setPortalBusyId(carrierId);
        try {
            const response = await fetch('/api/carrier-portals', {
                method: action === 'create' ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action === 'create' ? { carrierId } : { carrierId, action }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'No se pudo actualizar el enlace');
            setPortals(prev => ({ ...prev, [carrierId]: payload.portal }));
            if (payload.portal?.url && (action === 'create' || action === 'rotate')) {
                try { await navigator.clipboard.writeText(payload.portal.url); toast('Enlace copiado al portapapeles', 'success'); }
                catch { toast('Enlace generado. Usá el botón Copiar para compartirlo.', 'success'); }
            } else {
                toast('Enlace revocado', 'success');
            }
        } catch (err) {
            toast(err.message || 'No se pudo actualizar el enlace', 'error');
        } finally {
            setPortalBusyId(null);
        }
    };

    const copyPortalLink = async (portal) => {
        try { await navigator.clipboard.writeText(portal.url); toast('Enlace copiado al portapapeles', 'success'); }
        catch { toast('No se pudo copiar el enlace', 'error'); }
    };

    if (loading) {
        return <div className="card" style={{ padding: '16px' }}><div className="spinner"></div></div>;
    }

    if (carriers.length === 0) return null;

    return (
        <div className="card" style={{ padding: '16px' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '14px' }}>Links externos de solo lectura</h4>
            <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '12px' }}>Cada transportista ve únicamente sus envíos Flex asignados. Copiar o regenerar el link no modifica paquetes.</p>
            <div style={{ display: 'grid', gap: '8px' }}>
                {carriers.map(c => {
                    const portal = portals[c.id];
                    const busy = portalBusyId === c.id;
                    return <div key={`portal-${c.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', background: 'var(--surface-hover)' }}>
                        <div><strong style={{ fontSize: '13px' }}>{c.display_name || c.name}</strong><span style={{ display: 'block', color: portal?.active ? 'var(--success)' : 'var(--text-muted)', fontSize: '11px', marginTop: '3px' }}>{portal?.active ? 'Link activo' : 'Sin link activo'}</span></div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {portal?.active ? <><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => copyPortalLink(portal)}>Copiar</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handlePortalAction(c.id, 'rotate')}>Regenerar</button><button className="btn btn-sm" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => handlePortalAction(c.id, 'revoke')}>Revocar</button></> : <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => handlePortalAction(c.id, 'create')}>{busy ? 'Generando...' : 'Generar link'}</button>}
                        </div>
                    </div>;
                })}
            </div>
        </div>
    );
}
