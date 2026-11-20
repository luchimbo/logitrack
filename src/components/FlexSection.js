"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import CarrierPortalLinks from "./CarrierPortalLinks";
import EmptyGuide from "./EmptyGuide";
import { flexGuide, loadFailure } from "@/lib/emptyStates";
import SectionTitle from "./SectionTitle";
const zoneOf = (s) => s.partido || s.city || "Sin zona";
function argentinaDate(offset = 0) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const value = Object.fromEntries(parts.map(({ type, value }) => [type, value])); const date = new Date(`${value.year}-${value.month}-${value.day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - offset); return date.toISOString().slice(0, 10); }

export default function FlexSection({ onNavigate }) {
  const { getTodayQueryString } = useBatch();
  const [shipments, setShipments] = useState([]), [carriers, setCarriers] = useState([]), [portals, setPortals] = useState([]), [settings, setSettings] = useState(null), [loading, setLoading] = useState(true), [moving, setMoving] = useState(new Set()), [selected, setSelected] = useState(new Set()), [target, setTarget] = useState(""), [query, setQuery] = useState(""), [dragged, setDragged] = useState(null), [showControls, setShowControls] = useState(false), [showLinks, setShowLinks] = useState(false), [dateOffset, setDateOffset] = useState(0), [expandedLanes, setExpandedLanes] = useState(new Set()), [loadError, setLoadError] = useState("");
  const load = useCallback(async ({ silent = false } = {}) => { if (!silent) setLoading(true); try { const period = dateOffset ? `period=date&date=${argentinaDate(dateOffset)}` : getTodayQueryString(); const [items, cs, ps, ss] = await Promise.all([api(`/shipments?${period}&shipping_method=flex`), api("/carriers"), api("/carrier-portals"), api("/flex-portal-settings")]); setShipments(Array.isArray(items) ? items : []); setCarriers(cs || []); setPortals(ps || []); setSettings(ss || null); setLoadError(""); } catch (e) { if (!silent) setLoadError(e.message || "Reintentá en unos minutos."); toast(e.message || "No se pudo cargar Flex", "error"); } finally { if (!silent) setLoading(false); } }, [dateOffset, getTodayQueryString]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const sync = () => document.visibilityState === "visible" && load({ silent: true }); const timer = setInterval(sync, 10000); addEventListener("focus", sync); return () => { clearInterval(timer); removeEventListener("focus", sync); }; }, [load]);
  const filtered = useMemo(() => shipments.filter((s) => !query.trim() || [s.product_name, s.sku, s.partido, s.assigned_carrier].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [shipments, query]);
  const unassigned = filtered.filter((s) => !s.assigned_carrier); const byCarrier = useMemo(() => Object.fromEntries(carriers.map((c) => [c.name, filtered.filter((s) => s.assigned_carrier === c.name)])), [carriers, filtered]);
  const move = async (ids, carrierName) => { const valid = [...new Set(ids)].filter((id) => !moving.has(id)); if (!valid.length || !carrierName) return; const old = shipments; setMoving((x) => new Set([...x, ...valid])); setShipments((x) => x.map((s) => valid.includes(s.id) ? { ...s, assigned_carrier: carrierName } : s)); try { const r = await api("/shipments/flex-assignments", { method: "PATCH", body: JSON.stringify({ ids: valid, carrierName }) }); setSelected((x) => new Set([...x].filter((id) => !valid.includes(id)))); toast(`${valid.length} ${valid.length === 1 ? "paquete movido" : "paquetes movidos"} a ${r.carrierDisplayName}`, "success"); } catch (e) { setShipments(old); toast(e.message || "No se pudo mover. Intentá de nuevo.", "error"); } finally { setMoving((x) => new Set([...x].filter((id) => !valid.includes(id)))); } };
  const toggle = (id) => setSelected((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const saveCutoff = async (cutoffTime) => { try { const s = await api("/flex-portal-settings", { method: "PATCH", body: JSON.stringify({ cutoffTime: cutoffTime || null }) }); setSettings(s); toast("Horario guardado", "success"); } catch (e) { toast(e.message || "No se pudo guardar", "error"); } };
  const publish = async () => { try { const s = await api("/flex-portal-settings", { method: "POST" }); setSettings(s); toast("Operación publicada para hoy", "success"); } catch (e) { toast(e.message || "No se pudo publicar", "error"); } };
  const copy = async (carrier) => { const url = portals.find((p) => p.carrier_id === carrier.id)?.portal?.url; if (!url) return toast("Link no disponible", "error"); try { await navigator.clipboard.writeText(url); toast("Link copiado", "success"); } catch { toast("No se pudo copiar el link", "error"); } };
  const createOrCopyLink = async (carrier) => { const current = portals.find((p) => p.carrier_id === carrier.id)?.portal; if (current?.url) return copy(carrier); try { const response = await api("/carrier-portals", { method: "POST", body: JSON.stringify({ carrierId: carrier.id }) }); setPortals((items) => { const rest = items.filter((item) => item.carrier_id !== carrier.id); return [...rest, { carrier_id: carrier.id, portal: response.portal }]; }); await navigator.clipboard.writeText(response.portal.url); toast(`Link de ${carrier.display_name || carrier.name} creado y copiado`, "success"); } catch (error) { toast(error.message || "No se pudo crear el link", "error"); } };
  const renderCard = (shipment) => { const busy = moving.has(shipment.id), c = carriers.find((x) => x.name === shipment.assigned_carrier); return <article key={shipment.id} className={`flex-board-card ${busy ? "is-saving" : ""}`} draggable={!busy} onDragStart={() => setDragged(shipment.id)} onDragEnd={() => setDragged(null)}><label className="flex-card-check"><input type="checkbox" checked={selected.has(shipment.id)} onChange={() => toggle(shipment.id)} aria-label={`Seleccionar ${shipment.product_name}`} /></label><div className="flex-card-main"><strong title={shipment.product_name}>{shipment.product_name || "Producto sin nombre"}</strong><span>{shipment.sku ? `SKU ${shipment.sku}` : "Sin SKU"} · {zoneOf(shipment)}</span>{!shipment.assigned_carrier && !shipment.partido && <><span className="flex-address-warning">Revisá el partido del domicilio</span><span>{[shipment.address, shipment.postal_code, shipment.city].filter(Boolean).join(" · ") || "Domicilio sin datos"}</span>{shipment.province && <span>Zona en la etiqueta · {shipment.province}</span>}</>}</div><select value={shipment.assigned_carrier || ""} onChange={(e) => move([shipment.id], e.target.value)} disabled={busy} aria-label={`Transportista de ${shipment.product_name}`} style={c?.color ? { borderColor: c.color } : undefined}><option value="">Sin asignar</option>{carriers.map((x) => <option value={x.name} key={x.id}>{x.display_name || x.name}</option>)}</select>{busy && <span className="flex-saving" role="status">Guardando</span>}</article>; };
  const renderLane = (carrier, items) => {
    const hasLink = Boolean(portals.find((p) => p.carrier_id === carrier.id)?.portal?.url);
    const collapsed = !expandedLanes.has(carrier.id);
    const toggleCollapsed = () => setExpandedLanes((current) => {
      const next = new Set(current);
      next.has(carrier.id) ? next.delete(carrier.id) : next.add(carrier.id);
      return next;
    });
    return (
      <section
        key={carrier.id}
        className={`flex-lane ${collapsed ? "is-collapsed" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => {
          if (dragged) {
            move(selected.has(dragged) ? [...selected] : [dragged], carrier.name);
            setExpandedLanes((current) => new Set([...current, carrier.id]));
          }
          setDragged(null);
        }}
      >
        <header style={{ "--lane": carrier.color || "var(--accent)" }}>
          <button type="button" className="flex-lane-toggle" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-controls={`flex-carrier-${carrier.id}`}>
            <span aria-hidden="true">{collapsed ? "+" : "−"}</span>
            <span className="flex-lane-dot" aria-hidden="true" />
            <span className="flex-lane-copy"><strong>{carrier.display_name || carrier.name}</strong><small>{items.length} {items.length === 1 ? "paquete" : "paquetes"}</small></span>
          </button>
          <button type="button" onClick={() => createOrCopyLink(carrier)}>{hasLink ? "Copiar link" : "Crear link"}</button>
        </header>
        <div id={`flex-carrier-${carrier.id}`} className="flex-lane-list" hidden={collapsed}>
          {items.map(renderCard)}
          {!items.length ? <p className="flex-lane-empty">No hay paquetes asignados</p> : null}
        </div>
      </section>
    );
  };
  if (loading) return <section className="section active"><div className="section-loading" role="status"><div className="spinner" /><span>Cargando Flex…</span></div></section>;
  if (loadError && !shipments.length && !carriers.length) { const failure = loadFailure("Flex", loadError); return <section className="section active"><EmptyGuide error title={failure.title} text={failure.text} onRetry={() => load()} /></section>; }
  const guide = flexGuide({ shipments, carriers });
  const scheduleEnabled = Boolean(settings?.cutoffTime);
  return <section className="section active flex-board"><header className="flex-board-head"><div><SectionTitle icon="flex">Flex</SectionTitle><span className="section-subtitle">Distribución por transportista · {shipments.length} {shipments.length === 1 ? "paquete" : "paquetes"} · {carriers.length} {carriers.length === 1 ? "transportista" : "transportistas"}</span></div><div className="flex-board-actions"><button className={`btn btn-sm ${dateOffset === 0 ? "btn-primary" : ""}`} type="button" onClick={() => setDateOffset(0)}>Hoy</button><button className={`btn btn-sm ${dateOffset === 1 ? "btn-primary" : ""}`} type="button" onClick={() => setDateOffset(1)}>Ayer</button><span className={`flex-live ${settings?.state === "scheduled" ? "scheduled" : ""}`}>{dateOffset ? `Operación ${argentinaDate(1)}` : settings?.state === "scheduled" ? `Disponible ${settings.cutoffTime}` : "En vivo"}</span><button className="btn btn-sm" type="button" aria-expanded={showControls} onClick={() => setShowControls((x) => !x)}>Configuración de horario</button><button className="btn btn-sm" type="button" aria-expanded={showLinks} onClick={() => setShowLinks((x) => !x)}>Links de transportistas</button></div></header>{showControls && <aside className="flex-publication-panel"><div className="flex-schedule-copy"><strong>¿Cuándo ven los paquetes?</strong><p>Al activarlo, los links de los transportistas ocultan los paquetes de hoy hasta la hora elegida. Con el horario desactivado, cada paquete aparece apenas ingresa.</p></div><label className="flex-schedule-toggle"><input type="checkbox" checked={scheduleEnabled} onChange={(e) => saveCutoff(e.target.checked ? (settings?.cutoffTime || "09:00") : null)} /><span>Activar horario de publicación</span></label>{scheduleEnabled && <label>Hora Argentina<input type="time" value={settings.cutoffTime} onChange={(e) => saveCutoff(e.target.value)} /></label>}<button type="button" className="btn btn-primary btn-sm" onClick={publish} disabled={!scheduleEnabled || settings?.state === "live"}>Enviar paquetes ahora</button></aside>}{showLinks && <CarrierPortalLinks />}<div className="flex-board-toolbar"><input value={query} onChange={(e) => {
    const value = e.target.value;
    setQuery(value);
    if (value.trim()) {
      const matchingCarriers = shipments.filter((s) => [s.product_name, s.sku, s.partido, s.assigned_carrier].join(" ").toLowerCase().includes(value.trim().toLowerCase())).map((s) => s.assigned_carrier);
      setExpandedLanes((current) => new Set([...current, ...carriers.filter((c) => matchingCarriers.includes(c.name)).map((c) => c.id)]));
    }
  }} placeholder="Buscar producto, SKU o zona" aria-label="Buscar paquetes Flex" />
    <span className="flex-selection-count" role="status">{selected.size ? `${selected.size} seleccionados` : "Seleccioná paquetes para moverlos"}</span>
    <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Destino de la selección">
      <option value="">Elegir transportista</option>
      {carriers.map((c) => <option key={c.id} value={c.name}>{c.display_name || c.name}</option>)}
    </select>
    <button type="button" className="btn btn-primary btn-sm" disabled={!selected.size || !target} onClick={() => move([...selected], target)}>Mover</button>
  </div>
  {unassigned.length > 0 && (
    <section className="flex-unassigned" aria-labelledby="flex-unassigned-title">
      <h2 id="flex-unassigned-title">Sin asignar · {unassigned.length}</h2>
      <div>{unassigned.map(renderCard)}</div>
    </section>
  )}
  {query.trim() && filtered.length === 0 && <p className="flex-search-empty" role="status">No encontramos paquetes que coincidan con la búsqueda.</p>}
  {guide && !query.trim() ? <EmptyGuide title={guide.title} text={guide.text} actions={guide.actions} onNavigate={onNavigate}>{guide.extra ? <p className="empty-state-text">{guide.extra.title}. {guide.extra.text}</p> : null}</EmptyGuide> : null}
  <section className="flex-lanes" aria-label="Tablero de transportistas">
    {carriers.map((carrier) => renderLane(carrier, byCarrier[carrier.name] || []))}
  </section>
  </section>;
}
