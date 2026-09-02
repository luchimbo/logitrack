"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatArgentinaDate, formatArgentinaDateTime } from "@/lib/dateUtils";
import styles from "./PackageHistorySection.module.css";

const EMPTY_DETAIL = { loading: false, item: null, error: null };

function date(value, withTime = false) {
  if (!value) return "Sin fecha";
  return withTime ? formatArgentinaDateTime(value) : formatArgentinaDate(value);
}

function value(input) {
  return input === null || input === undefined || input === "" ? "—" : input;
}

function Fact({ label, children, wide = false }) {
  return <div className={`${styles.fact}${wide ? ` ${styles.wide}` : ""}`}><dt>{label}</dt><dd>{value(children)}</dd></div>;
}

function DetailGroup({ title, children }) {
  return <section className={styles.group}><h3>{title}</h3><dl className={styles.facts}>{children}</dl></section>;
}

function PackageDetail({ detail }) {
  const item = detail.item;
  if (detail.loading) return <div className={styles.empty}><div className={styles.spinner} /></div>;
  if (detail.error) return <div className={styles.empty}><div><strong>No se pudo abrir el paquete</strong>{detail.error}</div></div>;
  if (!item) return <div className={styles.empty}><div><strong>Seleccioná un paquete</strong>Elegí un resultado para ver todos sus datos.</div></div>;
  return <div className={styles.detailBody}>
    <div className={styles.detailTitle}><h3>{item.product_name}</h3><p>{item.tracking_number || item.sale_id || `Paquete #${item.id}`}</p></div>
    <DetailGroup title="Identificación"><Fact label="ID interno">#{item.id}</Fact><Fact label="Venta">{item.sale_id}</Fact><Fact label="Tracking / paquete" wide>{item.tracking_number}</Fact><Fact label="Tipo de venta">{item.sale_type}</Fact><Fact label="Remitente">{item.remitente_id}</Fact><Fact label="Proveedor">{item.external_provider}</Fact><Fact label="Orden externa">{item.external_order_id}</Fact><Fact label="Envío externo" wide>{item.external_shipment_id}</Fact></DetailGroup>
    <DetailGroup title="Producto"><Fact label="Producto" wide>{item.product_name}</Fact><Fact label="SKU">{item.sku}</Fact><Fact label="Cantidad">{item.quantity}</Fact><Fact label="Color">{item.color}</Fact><Fact label="Voltaje">{item.voltage}</Fact></DetailGroup>
    <DetailGroup title="Destinatario"><Fact label="Nombre">{item.recipient_name}</Fact><Fact label="Usuario">{item.recipient_user}</Fact><Fact label="Teléfono" wide>{item.recipient_phone}</Fact></DetailGroup>
    <DetailGroup title="Entrega"><Fact label="Dirección" wide>{item.address}</Fact><Fact label="Código postal">{item.postal_code}</Fact><Fact label="Ciudad">{item.city}</Fact><Fact label="Partido">{item.partido}</Fact><Fact label="Provincia">{item.province}</Fact><Fact label="Referencia" wide>{item.reference}</Fact></DetailGroup>
    <DetailGroup title="Logística"><Fact label="Estado">{item.status}</Fact><Fact label="Método">{item.shipping_method}</Fact><Fact label="Transportista">{item.carrier}</Fact><Fact label="Asignado">{item.assigned_carrier}</Fact><Fact label="Original">{item.carrier_name}</Fact><Fact label="Código">{item.carrier_code}</Fact><Fact label="Lote">{item.batch ? `#${item.batch.id}${item.batch.date ? ` · ${date(item.batch.date)}` : ""}` : null}</Fact></DetailGroup>
    <DetailGroup title="Fechas"><Fact label="Despacho (etiqueta)">{date(item.dispatch_date)}</Fact><Fact label="Entrega">{date(item.delivery_date)}</Fact><Fact label="Creado">{date(item.created_at, true)}</Fact><Fact label="Lote creado">{item.batch ? date(item.batch.created_at, true) : null}</Fact></DetailGroup>
  </div>;
}

export default function PackageHistorySection() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextBefore, setNextBefore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(EMPTY_DETAIL);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadFirstPage() {
      setLoading(true); setError(null); setSelectedId(null); setDetail(EMPTY_DETAIL);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (debouncedQuery) params.set("q", debouncedQuery);
        const data = await api(`/package-history?${params}`, { signal: controller.signal });
        setItems(data.items || []); setTotal(data.total || 0); setNextBefore(data.next_before || null);
      } catch (err) {
        if (err.name !== "AbortError") { setError(err.message || "No se pudo cargar el historial."); setItems([]); setTotal(0); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    loadFirstPage();
    return () => controller.abort();
  }, [debouncedQuery]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    async function loadDetail() {
      setDetail({ loading: true, item: null, error: null });
      try { const data = await api(`/package-history/${selectedId}`, { signal: controller.signal }); setDetail({ loading: false, item: data.item, error: null }); }
      catch (err) { if (err.name !== "AbortError") setDetail({ loading: false, item: null, error: err.message || "Intentá nuevamente." }); }
    }
    loadDetail();
    return () => controller.abort();
  }, [selectedId]);

  async function loadMore() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "50", before: nextBefore });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const data = await api(`/package-history?${params}`);
      setItems((current) => [...current, ...(data.items || [])]); setNextBefore(data.next_before || null);
    } catch (err) { setError(err.message || "No se pudieron cargar más paquetes."); }
    finally { setLoadingMore(false); }
  }

  const shownCount = items.length;
  return <div className={`section active ${styles.page}`}>
    <section className={styles.hero}>
      <div className={styles.heroTop}><div><p className={styles.kicker}>Operación · trazabilidad</p><h1>Historial de paquetes</h1><p>Buscá por producto, SKU, número de paquete o venta.</p></div><div className={styles.total}><strong>{total}</strong>{debouncedQuery ? "coincidencias" : "paquetes registrados"}</div></div>
      <label className={styles.search}><span className={styles.searchIcon}>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Producto, SKU, tracking o venta" aria-label="Buscar paquetes" autoComplete="off" />{query ? <button className={styles.clear} onClick={() => setQuery("")} aria-label="Limpiar búsqueda">×</button> : null}</label>
    </section>
    {error ? <p className={styles.error}>{error}</p> : null}
    <div className={styles.layout}>
      <section className={styles.results}><header className={styles.resultsHeader}><h2>Resultados</h2><span>{loading ? "Buscando…" : `${shownCount} de ${total}`}</span></header><div className={styles.resultList}>
        {loading ? <div className={styles.empty}><div className={styles.spinner} /></div> : null}
        {!loading && !items.length ? <div className={styles.empty}><div><strong>No encontramos paquetes</strong>{debouncedQuery ? "Probá con otro producto, SKU, tracking o venta." : "Todavía no hay paquetes registrados."}</div></div> : null}
        {!loading && items.map((item) => <button key={item.id} type="button" className={`${styles.result}${selectedId === item.id ? ` ${styles.resultActive}` : ""}`} onClick={() => setSelectedId(item.id)}><div className={styles.resultTop}><div><div className={styles.product}>{item.product_name}</div>{item.sku ? <span className={styles.sku}>{item.sku}</span> : null}</div><span className={styles.status}>{item.status}</span></div><div className={styles.resultMeta}><span><b>Paquete</b>{item.tracking_number || "—"}</span><span><b>Venta</b>{item.sale_id || item.external_order_id || "—"}</span><span><b>Transportista</b>{item.carrier}</span><span><b>Despacho</b>{date(item.dispatch_date)}</span></div></button>)}
      </div>{nextBefore ? <footer className={styles.footer}><button className="btn btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Cargando…" : "Cargar más paquetes"}</button></footer> : null}</section>
      <aside className={styles.detail}><header className={styles.detailHeader}><h2>Ficha del paquete</h2>{selectedId ? <button onClick={() => { setSelectedId(null); setDetail(EMPTY_DETAIL); }} aria-label="Cerrar ficha">×</button> : null}</header><PackageDetail detail={detail} /></aside>
    </div>
  </div>;
}
