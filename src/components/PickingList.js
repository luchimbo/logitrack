"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";

export default function PickingList() {
    const { getTodayQueryString } = useBatch();
    const [pickingList, setPickingList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getTodayQueryString();
                const data = await api(`/picking-list?${qs}`);
                data.sort((a, b) => {
                    const aComplete = a.statuses.every(s => s !== 'pendiente');
                    const bComplete = b.statuses.every(s => s !== 'pendiente');
                    if (aComplete !== bComplete) return aComplete ? 1 : -1;
                    return b.total_quantity - a.total_quantity;
                });
                setPickingList(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading && !pickingList.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📋 Lista de Picking</h1>
                </div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header"><h1 className="section-title">📋 Lista de Picking</h1></div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    if (!pickingList.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📋 Lista de Picking</h1>
                    <p className="section-subtitle">Productos a buscar — divididos por método de envío</p>
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon">📦</div>
                    <p className="empty-state-text">No hay productos para buscar.<br />Subí etiquetas primero.</p>
                </div>
            </div>
        );
    }

    const colectaItems = pickingList.filter(p => p.shipping_method === 'colecta');
    const flexItems = pickingList.filter(p => p.shipping_method === 'flex');
    const totalProducts = pickingList.length;
    const totalUnits = pickingList.reduce((sum, p) => sum + p.total_quantity, 0);
    const colectaUnits = colectaItems.reduce((sum, p) => sum + p.total_quantity, 0);
    const flexUnits = flexItems.reduce((sum, p) => sum + p.total_quantity, 0);

    const renderItem = (item, idx) => {
        return (
            <div key={idx} className={`picking-item`}>
                <div className="picking-qty">{item.total_quantity}</div>
                <div className="picking-info">
                    <div className="picking-name">{item.product_name}</div>
                    <div className="picking-sku">
                        SKU: {item.sku || 'N/A'}{item.color ? ` · ${item.color}` : ''} · {item.shipment_count} envío{item.shipment_count > 1 ? 's' : ''}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="section active">
            <div className="section-header flex-between">
                <div>
                    <h1 className="section-title">📋 Lista de Picking</h1>
                    <p className="section-subtitle">{totalProducts} productos — {totalUnits} unidades ({colectaItems.length} colecta, {flexItems.length} flex)</p>
                </div>
            </div>

            {colectaItems.length > 0 && (
                <div className="card mb-md" style={{ borderLeft: "3px solid #f59e0b" }}>
                    <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                        📦 Colecta <span className="badge badge-colecta">{colectaItems.length} productos · {colectaUnits} uds</span>
                    </h3>
                    <div>{colectaItems.map((item, i) => renderItem(item, i))}</div>
                </div>
            )}

            {flexItems.length > 0 && (
                <div className="card" style={{ borderLeft: "3px solid var(--accent)" }}>
                    <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                        🚀 Flex <span className="badge badge-flex">{flexItems.length} productos · {flexUnits} uds</span>
                    </h3>
                    <div>{flexItems.map((item, i) => renderItem(item, colectaItems.length + i))}</div>
                </div>
            )}
        </div>
    );
}
