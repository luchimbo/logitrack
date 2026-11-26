"use client";

import { useEffect, useMemo, useState } from "react";
import { api, toast } from "@/lib/api";
import { formatArgentinaDateTime } from "@/lib/dateUtils";
import { matchesCatalogSearch } from "@/lib/pickingCatalog";
import LoadingButton from "./LoadingButton";
import SectionTitle from "./SectionTitle";

const PAGE = 150;
const STATUS_FILTERS = [
    { id: "all", label: "Todas" },
    { id: "active", label: "Activas" },
    { id: "inactive", label: "Inactivas" },
];
const NOTE_FILTERS = [
    { id: "all", label: "Con y sin texto" },
    { id: "with", label: "Con texto" },
    { id: "without", label: "Sin texto" },
];
const STATUS_LABELS = { active: "activa", paused: "pausada" };
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function listingSummary(listings) {
    const counts = new Map();
    for (const { status } of listings) counts.set(status, (counts.get(status) || 0) + 1);
    return [...counts].map(([status, count]) => {
        const label = STATUS_LABELS[status] || status;
        return `${count} ${count === 1 ? label : `${label}s`}`;
    }).join(" · ");
}

function FilterGroup({ label, options, value, onChange }) {
    return (
        <div className="catalog-filters" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    className={`btn btn-sm ${value === option.id ? "btn-primary" : ""}`}
                    aria-pressed={value === option.id}
                    onClick={() => onChange(option.id)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export default function PickingCatalog({ onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const [noteFilter, setNoteFilter] = useState("all");
    const [limit, setLimit] = useState(PAGE);
    const [selected, setSelected] = useState(() => new Set());
    const [draft, setDraft] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            setData(await api("/picking-catalog"));
            setError(null);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => { load(); }, []);

    const items = useMemo(() => data?.items || [], [data]);
    const canEdit = Boolean(data?.canEdit);
    const visibleItems = useMemo(() => items.filter((item) => {
        if (status === "active" && !item.active) return false;
        if (status === "inactive" && item.active) return false;
        if (noteFilter === "with" && !item.note) return false;
        if (noteFilter === "without" && item.note) return false;
        return matchesCatalogSearch(item, query);
    }), [items, status, noteFilter, query]);
    const shown = visibleItems.slice(0, limit);
    const selectedItems = items.filter((item) => selected.has(item.key));
    const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selected.has(item.key));
    const activeCount = items.filter((item) => item.active).length;

    // Con varios productos elegidos, el cuadro arranca con su texto solo si todos tienen el mismo.
    useEffect(() => {
        const notes = new Set(items.filter((item) => selected.has(item.key)).map((item) => item.note));
        setDraft(notes.size === 1 ? [...notes][0] : "");
    }, [selected, items]);

    const changeFilter = (setter) => (value) => { setter(value); setLimit(PAGE); };

    const toggle = (key) => setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const toggleAllVisible = () => setSelected((previous) => {
        const next = new Set(previous);
        for (const item of visibleItems) {
            if (allVisibleSelected) next.delete(item.key); else next.add(item.key);
        }
        return next;
    });

    const sync = async () => {
        setSyncing(true);
        try {
            const result = await api("/picking-catalog/sync", { method: "POST" });
            const seeded = result.accounts.reduce((sum, account) => sum + account.seeded, 0);
            if (result.failedAccounts.length) {
                toast(`No pudimos leer ${result.failedAccounts.join(", ")}. Volvé a intentar.`, "error");
            } else {
                toast(`Catálogo actualizado${seeded ? `: ${plural(seeded, "producto", "productos")} con fuente cargada` : ""}.`, "success");
            }
            await load();
        } catch (err) {
            toast(err.message, "error");
        } finally {
            setSyncing(false);
        }
    };

    const save = async (note) => {
        const keys = [...selected];
        if (!keys.length) return;
        setSaving(true);
        try {
            await api("/picking-catalog/notes", { method: "PUT", body: JSON.stringify({ keys, note }) });
            const text = note.trim();
            setData((previous) => ({
                ...previous,
                items: previous.items.map((item) => (selected.has(item.key) ? { ...item, note: text } : item)),
            }));
            const target = plural(keys.length, "producto", "productos");
            toast(text ? `Texto guardado en ${target}.` : `Texto quitado de ${target}.`, "success");
            setSelected(new Set());
        } catch (err) {
            toast(err.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const maxLength = data?.maxNoteLength || 300;

    return (
        <div className="section active picking-section catalog-section">
            <div className="picking-hero">
                <div>
                    <SectionTitle icon="picking">Catálogo para picking</SectionTitle>
                    <p className="section-subtitle">
                        Un renglón por producto: las publicaciones con el mismo SKU comparten el texto, que aparece en el picking y en su PDF.
                        {data?.syncedAt ? ` Actualizado ${formatArgentinaDateTime(data.syncedAt)}.` : ""}
                    </p>
                </div>
                <div className="picking-actions">
                    <button type="button" className="btn" onClick={onClose}>Volver a picking</button>
                    {canEdit && (
                        <LoadingButton isLoading={syncing} spinnerSize="md" className="btn btn-primary" onClick={sync} disabled={!data?.connectedAccounts}>
                            Actualizar catálogo
                        </LoadingButton>
                    )}
                </div>
            </div>

            {error && <p role="alert" className="catalog-message">{error}</p>}
            {!data && !error && <div className="spinner"></div>}

            {data && (
                <>
                    <div className="catalog-toolbar">
                        <input
                            className="form-input catalog-search"
                            type="search"
                            value={query}
                            onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }}
                            placeholder="Buscar por nombre, SKU o número de publicación"
                            aria-label="Buscar en el catálogo"
                        />
                        <FilterGroup label="Filtrar por estado" options={STATUS_FILTERS} value={status} onChange={changeFilter(setStatus)} />
                        <FilterGroup label="Filtrar por texto" options={NOTE_FILTERS} value={noteFilter} onChange={changeFilter(setNoteFilter)} />
                    </div>

                    <div className="catalog-summary">
                        <span>
                            {visibleItems.length} de {plural(items.length, "producto", "productos")}
                            {items.length > 0 && ` · ${activeCount} con publicación activa, ${items.length - activeCount} inactivos`}
                        </span>
                        {canEdit && visibleItems.length > 0 && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAllVisible}>
                                {allVisibleSelected ? "Deseleccionar lo visible" : "Seleccionar todo lo visible"}
                            </button>
                        )}
                    </div>

                    {!items.length && (
                        <div className="empty-state">
                            <p className="empty-state-text">
                                {!data.connectedAccounts
                                    ? "Conectá una cuenta de Mercado Libre para ver su catálogo."
                                    : canEdit
                                        ? "Todavía no descargaste el catálogo. Tocá «Actualizar catálogo»."
                                        : "Un administrador tiene que descargar el catálogo."}
                            </p>
                        </div>
                    )}

                    <ul className="catalog-list">
                        {shown.map((item) => {
                            const isSelected = selected.has(item.key);
                            const content = (
                                <>
                                    {item.thumbnail
                                        ? <img className="catalog-thumb" src={item.thumbnail} alt="" loading="lazy" />
                                        : <span className="catalog-thumb" aria-hidden="true" />}
                                    <span className="catalog-info">
                                        <span className="catalog-title">{item.title}</span>
                                        <span className="catalog-meta">
                                            <strong>{item.skus.length ? `SKU ${item.skus.join(", ")}` : "Sin SKU"}</strong>
                                            {!item.active && <span className="catalog-inactive">Inactivo</span>}
                                            <span>
                                                {item.listings.length === 1
                                                    ? `${item.item_ids[0]} · ${listingSummary(item.listings)}`
                                                    : `${item.listings.length} publicaciones: ${listingSummary(item.listings)}`}
                                            </span>
                                            {item.accounts.length > 0 && <span>{item.accounts.join(", ")}</span>}
                                        </span>
                                        {item.note && <span className="picking-accessory">+ {item.note}</span>}
                                    </span>
                                </>
                            );
                            return (
                                <li key={item.key} className={`catalog-row ${isSelected ? "catalog-row-selected" : ""}`}>
                                    {canEdit ? (
                                        <label className="catalog-row-body">
                                            <input type="checkbox" checked={isSelected} onChange={() => toggle(item.key)} />
                                            {content}
                                        </label>
                                    ) : (
                                        <div className="catalog-row-body">{content}</div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    {visibleItems.length > shown.length && (
                        <button type="button" className="btn catalog-more" onClick={() => setLimit((value) => value + PAGE)}>
                            Mostrar {Math.min(PAGE, visibleItems.length - shown.length)} más
                        </button>
                    )}
                </>
            )}

            {canEdit && selectedItems.length > 0 && (
                <aside className="catalog-editor" aria-label="Texto para los productos elegidos">
                    <div className="catalog-editor-head">
                        <strong>{plural(selectedItems.length, "producto elegido", "productos elegidos")}</strong>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Cancelar</button>
                    </div>
                    <textarea
                        className="form-input catalog-textarea"
                        value={draft}
                        maxLength={maxLength}
                        rows={2}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Ej.: Fuente 12V 1A · 5.5×2.1 mm"
                        aria-label="Texto para picking"
                    />
                    <div className="catalog-editor-actions">
                        <span>{draft.length}/{maxLength}</span>
                        <button type="button" className="btn" disabled={saving} onClick={() => save("")}>Quitar texto</button>
                        <LoadingButton isLoading={saving} spinnerSize="md" className="btn btn-primary" disabled={!draft.trim()} onClick={() => save(draft)}>
                            Guardar en {selectedItems.length}
                        </LoadingButton>
                    </div>
                </aside>
            )}
        </div>
    );
}
