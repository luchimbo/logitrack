"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./CarrierPortalClient.module.css";

function argentinaIso(offset = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`));
}

function formatUpdated(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

function Icon({ name }) {
  if (name === "refresh") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.8-4.2L3 9m0-5v5h5M4 13a8 8 0 0 0 14.8 4.2L21 15m0 5v-5h-5" /></svg>;
  if (name === "download") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 18v3h16v-3" /></svg>;
  if (name === "phone") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.8 9.3 3l1.8 4.8-2.3 1.6a16.5 16.5 0 0 0 5.7 5.7l1.6-2.3 4.8 1.8-.8 2.7c-.3 1.1-1.4 1.8-2.5 1.6C10.1 17.7 6.3 13.9 5.1 6.4 4.9 5.2 5.5 4.1 6.6 3.8Z" /></svg>;
  if (name === "label") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.4 12.6 5.4A2 2 0 0 0 11.2 5H5a1 1 0 0 0-1 1v6.2c0 .53.21 1.04.59 1.41l8 8a2 2 0 0 0 2.82 0l5.19-5.19a2 2 0 0 0 0-2.82ZM8.5 10.5H9" /></svg>;
  if (name === "print") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3M7 13h10v8H7Z" /></svg>;
  if (name === "close") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12h6m-3-3v6M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" /></svg>;
}

export default function CarrierPortalClient({ publicId }) {
  const [secret, setSecret] = useState("");
  const [date, setDate] = useState(() => argentinaIso());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(null);
  const [online, setOnline] = useState(true);
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("");
  const [label, setLabel] = useState(null);
  const labelUrlRef = useRef(null);

  useEffect(() => {
    const match = window.location.hash.match(/(?:^#|[&#])k=([^&]+)/);
    setSecret(match ? decodeURIComponent(match[1]) : "");
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!secret) return;
    if (silent) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date }); if (silent && revision !== null) params.set("revision", String(revision));
      const response = await fetch(`/api/public/carrier-portals/${encodeURIComponent(publicId)}?${params}`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
      if (response.status === 304) return;
      if (!response.ok) throw new Error(response.status === 404 ? "Este enlace no está disponible." : "No pudimos cargar la operación.");
      const payload = await response.json(); setData(payload); setRevision(payload.publication?.revision ?? null); setOnline(true);
    } catch (err) {
      setError(err.message || "No pudimos cargar la operación."); setOnline(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, publicId, revision, secret]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!secret) return undefined;
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") load({ silent: true }); }, 2_000);
    return () => window.clearInterval(interval);
  }, [load, secret]);
  useEffect(() => { const sync = () => load({ silent: true }); window.addEventListener("focus", sync); window.addEventListener("online", sync); return () => { window.removeEventListener("focus", sync); window.removeEventListener("online", sync); }; }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.shipments || []).filter((shipment) => {
      if (zone && shipment.partido !== zone) return false;
      return !query || [shipment.trackingNumber, shipment.orderId, shipment.productName, shipment.recipientName, shipment.address, shipment.city, shipment.partido].join(" ").toLowerCase().includes(query);
    });
  }, [data, search, zone]);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => argentinaIso(index)), []);

  const download = async (format) => {
    const params = new URLSearchParams({ date, format });
    if (zone) params.set("zone", zone);
    if (search.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/public/carrier-portals/${encodeURIComponent(publicId)}?${params}`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
    if (!response.ok) { setError("No se pudo generar la descarga."); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `operacion-${date}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyAddress = async (address) => {
    try { await navigator.clipboard.writeText(address); } catch { setError("No se pudo copiar la dirección."); }
  };

  const revokeLabelUrl = useCallback(() => {
    if (labelUrlRef.current) {
      URL.revokeObjectURL(labelUrlRef.current);
      labelUrlRef.current = null;
    }
  }, []);

  useEffect(() => revokeLabelUrl, [revokeLabelUrl]);

  const closeLabel = useCallback(() => {
    revokeLabelUrl();
    setLabel(null);
  }, [revokeLabelUrl]);

  const openLabel = useCallback(async (shipment) => {
    revokeLabelUrl();
    setLabel({ shipment, status: "loading", url: null, error: "" });
    try {
      const response = await fetch(`/api/public/carrier-portals/${encodeURIComponent(publicId)}/labels/${encodeURIComponent(String(shipment.id))}`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "Este paquete aún no tiene etiqueta disponible." : "No pudimos cargar la etiqueta.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      labelUrlRef.current = url;
      setLabel({ shipment, status: "ready", url, error: "" });
    } catch (err) {
      revokeLabelUrl();
      setLabel({ shipment, status: "error", url: null, error: err.message || "No pudimos cargar la etiqueta." });
    }
  }, [publicId, revokeLabelUrl, secret]);

  const printLabel = useCallback(() => {
    if (!label?.url) return;
    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) { setLabel((current) => ({ ...current, status: "error", error: "Navegador bloqueó la ventana de impresión." })); return; }
    win.document.write(`<!doctype html><html><head><title>Etiqueta ${label.shipment.trackingNumber || label.shipment.id}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;height:auto}</style></head><body onload="setTimeout(function(){try{window.focus();window.print()}catch(e){}},350)"><img src="${label.url}" alt="Etiqueta" /></body></html>`);
    win.document.close();
  }, [label]);

  useEffect(() => {
    if (!label) return undefined;
    const onKey = (event) => { if (event.key === "Escape") closeLabel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [label, closeLabel]);

  useEffect(() => {
    if (!label) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [label]);

  if (!secret && !loading) return <main className={styles.centered}><section className={styles.errorCard}><h1>Enlace incompleto</h1><p>Pedile al administrador que te comparta el enlace completo.</p></section></main>;
  if (loading && !data) return <main className={styles.centered}><div className={styles.loader} aria-label="Cargando operación" /></main>;
  if (error && !data) return <main className={styles.centered}><section className={styles.errorCard}><h1>Portal no disponible</h1><p>{error}</p><button type="button" onClick={() => load()}>Reintentar</button></section></main>;
  if (!data) return <main className={styles.centered}><div className={styles.loader} aria-label="Cargando operación" /></main>;

  const zones = data?.zoneSummary || [];
  return <main className={styles.page} style={{ "--carrier": data?.portal?.carrierColor || "#0f766e" }}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>OPERACIÓN FLEX · SOLO LECTURA</p><h1>{data.portal?.carrierName || "Transportista"}</h1><p className={styles.subhead}>Paquetes asignados para tu recorrido.</p></div>
      <span role="status" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 14px", border: "1px solid #45525b", borderRadius: 999, background: "#1c2429", color: online ? "#8fd4c9" : "#f0b3ac", font: "700 12px ui-monospace,monospace" }}>{!online ? "Sin conexión" : refreshing ? "Sincronizando" : data?.publication?.state === "scheduled" ? `Disponible ${data.publication.cutoffTime}` : "En vivo"}</span>
    </header>
    <p className={styles.updated}>Actualizado {formatUpdated(data.portal?.refreshedAt)} · se refresca automáticamente</p>
    <nav className={styles.dateNav} aria-label="Elegir fecha">{dates.map((item) => <button type="button" key={item} className={date === item ? styles.activeDate : ""} onClick={() => setDate(item)}>{item === argentinaIso() ? "Hoy" : formatDate(item)}</button>)}</nav>
    {data?.publication?.state === "scheduled" ? <section style={{ margin: "26px 0", padding: 28, border: "1px solid #45525b", background: "#171e22", textAlign: "center" }}><h2>La operación todavía no está disponible</h2><p>Los paquetes de hoy aparecerán automáticamente a las {data.publication.cutoffTime}, hora Argentina.</p></section> : <><section className={styles.metrics} aria-label="Resumen operativo">
      <div><strong>{data.summary.packages}</strong><span>Paquetes</span></div><div><strong>{data.summary.units}</strong><span>Unidades</span></div><div><strong>{data.summary.zones}</strong><span>Zonas</span></div>
    </section>
    <section className={styles.controls} aria-label="Filtros y descargas">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar paquete, destinatario o zona" aria-label="Buscar paquetes" />
      <select value={zone} onChange={(event) => setZone(event.target.value)} aria-label="Filtrar por zona"><option value="">Todas las zonas</option>{zones.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.packages}</option>)}</select>
      <div className={styles.exports}><button type="button" onClick={() => download("csv")}><Icon name="download" />CSV</button><button type="button" onClick={() => download("pdf")}><Icon name="download" />PDF</button></div>
    </section>
    {error && <p className={styles.inlineError} role="alert">{error}</p>}
    <section className={styles.zoneStrip} aria-label="Resumen por zona">{zones.map((item) => <span key={item.name}><b>{item.name}</b>{item.packages} paquetes · {item.units} u.</span>)}</section>
    <section className={styles.list}><div>{filtered.map((shipment) => <article className={styles.shipment} key={shipment.id}>
        <div className={styles.shipmentTop}><p className={styles.zone}>{shipment.partido}</p></div>
        <h3>{shipment.productName}</h3><p className={styles.sku}>{shipment.sku ? `SKU ${shipment.sku} · ` : ""}{shipment.quantity} {shipment.quantity === 1 ? "unidad" : "unidades"}</p>
        <dl><div><dt>Destinatario</dt><dd>{shipment.recipientName}</dd></div><div><dt>Dirección</dt><dd>{shipment.address}{shipment.reference ? ` · ${shipment.reference}` : ""}</dd></div><div><dt>Localidad</dt><dd>{[shipment.city, shipment.province, shipment.postalCode && `CP ${shipment.postalCode}`].filter(Boolean).join(" · ") || "No informada"}</dd></div>{shipment.trackingNumber && <div><dt>Tracking</dt><dd>{shipment.trackingNumber}</dd></div>}</dl>
        <footer>{shipment.recipientPhone ? <a href={`tel:${shipment.recipientPhone.replace(/\s/g, "")}`}><Icon name="phone" />Llamar</a> : <span>Teléfono no informado</span>}<button type="button" onClick={() => copyAddress([shipment.address, shipment.city, shipment.province, shipment.postalCode].filter(Boolean).join(", "))}>Copiar dirección</button><button type="button" onClick={() => openLabel(shipment)}><Icon name="label" />Ver etiqueta</button></footer>
      </article>)}</div></section>
    {!filtered.length && <section className={styles.empty}><h2>No hay paquetes con estos filtros</h2><p>Probá cambiando la fecha o quitando algún filtro.</p></section>}</>}
    {label && createPortal(
      <div className={styles.labelOverlay} role="dialog" aria-modal="true" aria-label={`Etiqueta de ${label.shipment.trackingNumber || label.shipment.id}`} onClick={(event) => { if (event.target === event.currentTarget) closeLabel(); }}>
        <div className={styles.labelCard}>
          <header><h2>Etiqueta{label.shipment.trackingNumber ? ` · ${label.shipment.trackingNumber}` : ""}</h2><button type="button" className={styles.labelClose} onClick={closeLabel}><Icon name="close" />Cerrar</button></header>
          <div className={styles.labelBody}>
            {label.status === "loading" && <div className={styles.labelSpinner} aria-label="Cargando etiqueta" />}
            {label.status === "error" && <p className={styles.labelError} role="alert">{label.error}</p>}
            {label.status === "ready" && label.url && <img src={label.url} alt={`Etiqueta del paquete ${label.shipment.trackingNumber || label.shipment.id}`} />}
          </div>
          {label.status === "ready" && <footer><button type="button" onClick={closeLabel}>Cerrar</button><button type="button" onClick={printLabel}><Icon name="print" />Imprimir</button></footer>}
        </div>
      </div>,
      document.body
    )}
  </main>;
}
