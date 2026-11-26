"use client";

import { useEffect, useMemo, useState } from "react";
import { api, toast } from "@/lib/api";
import { formatArgentinaDateTime } from "@/lib/dateUtils";
import { matchesCatalogSearch } from "@/lib/pickingCatalog";
import LoadingButton from "./LoadingButton";
import SectionTitle from "./SectionTitle";

const PAGE = 150;
const FILTERS = [
    { id: "all", label: "Todas" },
    { id: "with", label: "Con texto" },
    { id: "without", label: "Sin texto" },
];
const STATUS_LABELS = { active: "Activa", paused: "Pausada" };

export default function PickingCatalog({ onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const [limit, setLimit] = useState(PAGE);
    const [selected, setSelected] = useState(() => new Set());
    const [draft, setDraft] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const result = await api("/picking-catalog");
            setData(result);
            setError(null);
            return result;
        } catch (err) {
            setError(err.message);
            return null;
        }
    };

    useEffect(() => { load(); }, []);

    const items = useMemo(() => data?.items || [], [data]);
    const canEdit = Boolean(data?.canEdit);
    const visibleItems = useMemo(() => items.filter((item) => {
        if (filter === "with" && !item.note) return false;
        if (filter === "without" && item.note) return false;
        return matchesCatalogSearch(item, query);
    }), [items, filter, query]);
    const shown = visibleItems.slice(0, limit);
    const selectedItems = items.filter((item) => selected.has(item.item_id));
    const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selected.has(item.item_id));

    // Con varias publicaciones elegidas, el cuadro arranca con su texto solo si todas tienen el mismo.
    useEffect(() => {
        const notes = new Set(items.filter((item) => selected.has(item.item_id)).map((item) => item.note));
        setDraft(notes.size === 1 ? [...notes][0] : "");
    }, [selected, items]);

    const toggle = (itemId) => setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
        return next;
    });

    const toggleAllVisible = () => setSelected((previous) => {
        const next = new Set(previous);
        for (const item of visibleItems) {
            if (allVisibleSelected) next.delete(item.item_id); else next.add(item.item_id);
        }
        return next;
    });

    const sync = async () => {
        setSyncing(true);
        try {
            const result = await api("/picking-catalog/sync", { method: "POST" });
            const total = result.accounts.reduce((sum, account) => sum + account.items, 0);
            const seeded = result.accounts.reduce((sum, account) => sum + account.seeded, 0);
            if (result.failedAccounts.length) {
                toast(`No pudimos leer ${result.failedAccounts.join(", ")}. Volvé a intentar.`, "error");
            } else {
                toast(`Catálogo actualizado: ${total} publicaciones${seeded ? `, ${seeded} con fuente cargada` : ""}.`, "success");
            }
            await load();
        } catch (err) {
            toast(err.message, "error");
        } finally {
            setSyncing(false);
        }
    };

    const save = async (note) => {
        const itemIds = [...selected];
        if (!itemIds.length) return;
        setSaving(true);
        try {
            await api("/picking-catalog/notes", { method: "PUT", body: JSON.stringify({ itemIds, note }) });
            const text = note.trim();
            setData((previous) => ({
                ...previous,
                items: previous.items.map((item) => (selected.has(item.item_id) ? { ...item, note: text } : item)),
            }));
            toast(text
                ? `Texto guardado en ${itemIds.length === 1 ? "1 publicación" : `${itemIds.length} publicaciones`}.`
                : `Texto quitado de ${itemIds.length === 1 ? "1 publicación" : `${itemIds.length} publicaciones`}.`, "success");
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
                        El texto de cada publicación aparece en el picking y en su PDF.
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
                        <div className="catalog-filters" role="group" aria-label="Filtrar por texto">
                            {FILTERS.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={`btn btn-sm ${filter === option.id ? "btn-primary" : ""}`}
                                    aria-pressed={filter === option.id}
                                    onClick={() => { setFilter(option.id); setLimit(PAGE); }}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="catalog-summary">
                        <span>{visibleItems.length} de {items.length} publicaciones</span>
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
                            const isSelected = selected.has(item.item_id);
                            const content = (
                                <>
                                    {item.thumbnail
                                        ? <img className="catalog-thumb" src={item.thumbnail} alt="" loading="lazy" />
                                        : <span className="catalog-thumb" aria-hidden="true" />}
                                    <span className="catalog-info">
                                        <span className="catalog-title">{item.title}</span>
                                        <span className="catalog-meta">
                                            <strong>{item.skus.length ? `SKU ${item.skus.join(", ")}` : "Sin SKU"}</strong>
                                            <span>{item.item_id}</span>
                                            {item.account && <span>{item.account}</span>}
                                            {item.status !== "active" && <span>{STATUS_LABELS[item.status] || item.status}</span>}
                                        </span>
                                        {item.note && <span className="picking-accessory">+ {item.note}</span>}
                                    </span>
                                </>
                            );
                            return (
                                <li key={item.item_id} className={`catalog-row ${isSelected ? "catalog-row-selected" : ""}`}>
                                    {canEdit ? (
                                        <label className="catalog-row-body">
                                            <input type="checkbox" checked={isSelected} onChange={() => toggle(item.item_id)} />
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
                <aside className="catalog-editor" aria-label="Texto para las publicaciones elegidas">
                    <div className="catalog-editor-head">
                        <strong>{selectedItems.length === 1 ? "1 publicación elegida" : `${selectedItems.length} publicaciones elegidas`}</strong>
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
                            Guardar en {selectedItems.length === 1 ? "1" : selectedItems.length}
                        </LoadingButton>
                    </div>
                </aside>
            )}
        </div>
    );
}
