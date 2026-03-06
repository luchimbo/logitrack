"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";

const PARTIDOS = [
    // CABA
    { id: 'capital_federal', name: 'CABA', zone: 'capital' },
    // GBA 1
    { id: 'san_isidro', name: 'San Isidro', zone: 'gba1' },
    { id: 'vicente_lopez', name: 'V. López', zone: 'gba1' },
    { id: 'san_fernando', name: 'San Fernando', zone: 'gba1' },
    { id: 'san_martin', name: 'San Martín', zone: 'gba1' },
    { id: '3_de_febrero', name: '3 de Febrero', zone: 'gba1' },
    { id: 'hurlingham', name: 'Hurlingham', zone: 'gba1' },
    { id: 'ituzaingo', name: 'Ituzaingó', zone: 'gba1' },
    { id: 'moron', name: 'Morón', zone: 'gba1' },
    { id: 'avellaneda', name: 'Avellaneda', zone: 'gba1' },
    { id: 'lanus', name: 'Lanús', zone: 'gba1' },
    { id: 'la_matanza_norte', name: 'La Matanza Norte', zone: 'gba1' },
    // GBA 2
    { id: 'tigre', name: 'Tigre', zone: 'gba2' },
    { id: 'malvinas_argentinas', name: 'Malvinas Arg.', zone: 'gba2' },
    { id: 'jose_c_paz', name: 'J.C. Paz', zone: 'gba2' },
    { id: 'san_miguel', name: 'San Miguel', zone: 'gba2' },
    { id: 'moreno', name: 'Moreno', zone: 'gba2' },
    { id: 'merlo', name: 'Merlo', zone: 'gba2' },
    { id: 'la_matanza_sur', name: 'La Matanza Sur', zone: 'gba2' },
    { id: 'la_matanza', name: 'La Matanza', zone: 'gba2' },
    { id: 'ezeiza', name: 'Ezeiza', zone: 'gba2' },
    { id: 'esteban_echeverria', name: 'E. Echeverría', zone: 'gba2' },
    { id: 'almirante_brown', name: 'A. Brown', zone: 'gba2' },
    { id: 'lomas_de_zamora', name: 'Lomas de Zamora', zone: 'gba2' },
    { id: 'quilmes', name: 'Quilmes', zone: 'gba2' },
    { id: 'berazategui', name: 'Berazategui', zone: 'gba2' },
    { id: 'florencio_varela', name: 'F. Varela', zone: 'gba2' },
    // GBA 3
    { id: 'escobar', name: 'Escobar', zone: 'gba3' },
    { id: 'pilar', name: 'Pilar', zone: 'gba3' },
    { id: 'lujan', name: 'Luján', zone: 'gba3' },
    { id: 'general_rodriguez', name: 'Gral. Rodríguez', zone: 'gba3' },
    { id: 'marcos_paz', name: 'Marcos Paz', zone: 'gba3' },
    { id: 'canuelas', name: 'Cañuelas', zone: 'gba3' },
    { id: 'san_vicente', name: 'San Vicente', zone: 'gba3' },
    { id: 'pte_peron', name: 'Pte. Perón', zone: 'gba3' },
    { id: 'ensenada', name: 'Ensenada', zone: 'gba3' },
    { id: 'la_plata', name: 'La Plata', zone: 'gba3' },
    { id: 'berisso', name: 'Berisso', zone: 'gba3' },
];

const ZONE_COLORS = {
    capital: '#ff69b4',
    gba1: '#20b2aa',
    gba2: '#00008b',
    gba3: '#ff0000',
};

const ZONE_GROUPS = [
    { id: 'capital', label: 'CAPITAL' },
    { id: 'gba1', label: 'GBA 1' },
    { id: 'gba2', label: 'GBA 2' },
    { id: 'gba3', label: 'GBA 3 OPCIONAL' }
];

export default function ZoneConfig() {
    const [zones, setZones] = useState([]);
    const [carriers, setCarriers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [newCarrier, setNewCarrier] = useState({ name: "", display_name: "", color: "#6366f1" });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [zonesData, carriersData] = await Promise.all([
                api('/zones'),
                api('/carriers'),
            ]);
            setZones(zonesData);
            setCarriers(carriersData);
        } catch (err) {
            toast("Error al cargar configuración", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddCarrier = async () => {
        if (!newCarrier.name.trim()) {
            toast('Ingresá un identificador', 'error');
            return;
        }
        try {
            const params = new URLSearchParams({ name: newCarrier.name });
            if (newCarrier.display_name) params.append('display_name', newCarrier.display_name);
            if (newCarrier.color) params.append('color', newCarrier.color);

            await fetch(`/api/carriers?${params.toString()}`, { method: 'POST' });
            toast('Transportista agregado', 'success');
            setNewCarrier({ name: "", display_name: "", color: "#6366f1" });
            fetchData();
        } catch (err) {
            toast('Error al agregar transportista', 'error');
        }
    };

    const handleDeleteCarrier = async (id) => {
        if (!confirm('¿Seguro que querés eliminar este transportista?')) return;
        try {
            await fetch(`/api/carriers/${id}`, { method: 'DELETE' });
            toast('Transportista eliminado', 'success');
            fetchData();
        } catch (err) {
            toast('Error al eliminar', 'error');
        }
    };

    const handleAssignZone = async (partidoId, carrierName) => {
        if (!carrierName) return;
        const params = new URLSearchParams({ partido: partidoId, carrier_name: carrierName });
        await fetch(`/api/zones?${params.toString()}`, { method: 'POST' });
        toast('Transportista asignado', 'success');
        fetchData();
    };

    const handleAssignGroup = async (groupId) => {
        const carrierSelect = document.getElementById(`group-select-${groupId}`);
        const carrier = carrierSelect.value;
        if (!carrier) {
            toast('Seleccioná un transportista primero', 'error');
            return;
        }

        const groupPartidos = PARTIDOS.filter(p => p.zone === groupId).map(p => p.id);
        let assignedCount = 0;

        try {
            for (const p of groupPartidos) {
                const params = new URLSearchParams({ partido: p, carrier_name: carrier });
                await fetch(`/api/zones?${params.toString()}`, { method: 'POST' });
                assignedCount++;
            }
            toast(`${assignedCount} zonas de ${groupId} asignadas a ${carrier}`, 'success');
            fetchData();
        } catch (err) {
            toast('Error asignando zonas masivamente', 'error');
        }
    };

    const handleRemoveZone = async (zoneId) => {
        try {
            await fetch(`/api/zones/${zoneId}`, { method: 'DELETE' });
            toast('Zona liberada', 'success');
            fetchData();
        } catch (err) {
            toast('Error al remover zona', 'error');
        }
    };


    if (loading) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">⚙️ Configuración de Zonas Flex</h1>
                </div>
                <div className="spinner"></div>
            </div>
        );
    }

    // Build multi-carrier map: partido -> array of assignments
    const zoneMapData = {};
    zones.forEach(z => {
        if (!zoneMapData[z.partido]) zoneMapData[z.partido] = [];
        zoneMapData[z.partido].push({ carrier_name: z.carrier_name, zone_id: z.id });
    });

    return (
        <div className="section active">
            <div className="section-header">
                <h1 className="section-title">⚙️ Configuración de Zonas Flex</h1>
                <p className="section-subtitle">Asigná transportistas a cada partido del AMBA</p>
            </div>

            <div className="card mb-lg">
                <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: 700 }}>🚛 Transportistas Flex Activos</h3>
                <div className="form-row mb-md">
                    <div className="form-group">
                        <label className="form-label">Identificador / Usuario</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="ej: moto_juan"
                            value={newCarrier.name}
                            onChange={(e) => setNewCarrier({ ...newCarrier, name: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Nombre para mostrar</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="ej: Juan"
                            value={newCarrier.display_name}
                            onChange={(e) => setNewCarrier({ ...newCarrier, display_name: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Color (Opcional)</label>
                        <input
                            type="color"
                            className="form-input"
                            value={newCarrier.color}
                            onChange={(e) => setNewCarrier({ ...newCarrier, color: e.target.value })}
                            style={{ height: "40px", padding: "4px" }}
                        />
                    </div>
                    <button className="btn btn-primary" onClick={handleAddCarrier} style={{ height: "40px", alignSelf: "flex-end", marginBottom: "4px" }}>
                        + Agregar
                    </button>
                </div>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {carriers.length === 0 ? (
                        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Agregá al menos un transportista para poder asignar zonas.</p>
                    ) : (
                        carriers.map(c => (
                            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface-hover)", padding: "8px 14px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                                <div style={{ width: "14px", height: "14px", borderRadius: "3px", background: c.color || '#6366f1' }}></div>
                                <span style={{ fontWeight: 600, fontSize: "13px" }}>{c.display_name || c.name}</span>
                                <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", fontSize: "11px", color: "var(--danger)" }} onClick={() => handleDeleteCarrier(c.id)} title="Eliminar">✏️/❌</button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: 700 }}>📍 Asignación de Partidos</h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
                {ZONE_GROUPS.map(group => {
                    const groupColor = ZONE_COLORS[group.id];
                    const groupPartidos = PARTIDOS.filter(p => p.zone === group.id);

                    return (
                        <div key={group.id} className="card" style={{ borderTop: `4px solid ${groupColor}`, padding: 0 }}>
                            <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--surface-hover)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                    <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: groupColor }}>{group.label}</h4>
                                    <span className="badge" style={{ background: `${groupColor}20`, color: groupColor }}>{groupPartidos.length} zonas</span>
                                </div>

                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <select className="form-select" id={`group-select-${group.id}`} style={{ fontSize: "12px", flex: 1 }}>
                                        <option value="">— Asignar a todos —</option>
                                        {carriers.map(c => <option key={c.name} value={c.name}>{c.display_name || c.name}</option>)}
                                    </select>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleAssignGroup(group.id)} style={{ padding: "6px 12px", fontSize: "12px" }}>Aplicar</button>
                                </div>
                            </div>

                            <div style={{ padding: "16px" }}>
                                {groupPartidos.map(p => {
                                    const assignments = zoneMapData[p.id] || [];
                                    const hasAssignments = assignments.length > 0;

                                    return (
                                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed var(--border)", flexWrap: "wrap", gap: "6px" }}>
                                            <div style={{ fontSize: "13px", fontWeight: 600, color: hasAssignments ? "var(--text)" : "var(--text-muted)", minWidth: "100px" }}>
                                                {p.name}
                                            </div>
                                            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                                                {assignments.map(a => {
                                                    const cDisplay = carriers.find(c => c.name === a.carrier_name)?.display_name || a.carrier_name;
                                                    return (
                                                        <span key={a.zone_id} className="badge badge-flex" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                                            🚛 {cDisplay}
                                                            <button onClick={() => handleRemoveZone(a.zone_id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "10px", padding: "0 2px" }}>✕</button>
                                                        </span>
                                                    );
                                                })}
                                                <select
                                                    className="form-select"
                                                    style={{ fontSize: "11px", padding: "4px", width: "120px", background: "var(--bg-secondary)" }}
                                                    onChange={(e) => { handleAssignZone(p.id, e.target.value); e.target.value = ''; }}
                                                    value=""
                                                >
                                                    <option value="">{hasAssignments ? '+ Agregar' : 'Asignar'}</option>
                                                    {carriers.map(c => <option key={c.id} value={c.name}>{c.display_name || c.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
