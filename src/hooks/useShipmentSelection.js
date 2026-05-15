"use client";

import { useCallback, useState } from "react";

function getItemId(item) {
    return item?.id;
}

export function useShipmentSelection(initialIds = []) {
    const [selectedShipmentIds, setSelectedShipmentIds] = useState(initialIds);

    const toggleShipmentSelection = useCallback((id) => {
        setSelectedShipmentIds((prev) => prev.includes(id) ? prev.filter((shipmentId) => shipmentId !== id) : [...prev, id]);
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedShipmentIds([]);
    }, []);

    const removeSelectedIds = useCallback((ids) => {
        const idsToRemove = new Set(Array.isArray(ids) ? ids : [ids]);
        setSelectedShipmentIds((prev) => prev.filter((id) => !idsToRemove.has(id)));
    }, []);

    const keepOnlyExisting = useCallback((items) => {
        const existingIds = new Set((items || []).map(getItemId));
        setSelectedShipmentIds((prev) => prev.filter((id) => existingIds.has(id)));
    }, []);

    const getSelectedFrom = useCallback((items) => {
        const selected = new Set(selectedShipmentIds);
        return (items || []).filter((item) => selected.has(getItemId(item)));
    }, [selectedShipmentIds]);

    const getSelectedIdsFrom = useCallback((items) => getSelectedFrom(items).map(getItemId), [getSelectedFrom]);

    const getSelectedCountFrom = useCallback((items) => getSelectedIdsFrom(items).length, [getSelectedIdsFrom]);

    const areAllSelected = useCallback((items) => {
        const list = items || [];
        return list.length > 0 && list.every((item) => selectedShipmentIds.includes(getItemId(item)));
    }, [selectedShipmentIds]);

    const toggleItemsSelection = useCallback((items) => {
        const ids = (items || []).map(getItemId).filter(Boolean);
        if (!ids.length) return;

        const allSelected = ids.every((id) => selectedShipmentIds.includes(id));
        setSelectedShipmentIds((prev) => {
            if (allSelected) {
                return prev.filter((id) => !ids.includes(id));
            }
            return [...new Set([...prev, ...ids])];
        });
    }, [selectedShipmentIds]);

    return {
        selectedShipmentIds,
        setSelectedShipmentIds,
        toggleShipmentSelection,
        toggleItemsSelection,
        clearSelection,
        removeSelectedIds,
        keepOnlyExisting,
        getSelectedFrom,
        getSelectedIdsFrom,
        getSelectedCountFrom,
        areAllSelected,
    };
}
