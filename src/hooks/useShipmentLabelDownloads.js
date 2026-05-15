"use client";

import { useCallback, useState } from "react";
import { downloadLabelZpl, downloadLabelsZpl, toast } from "@/lib/api";

export function useShipmentLabelDownloads() {
    const [downloadingId, setDownloadingId] = useState(null);
    const [isDownloadingBulk, setIsDownloadingBulk] = useState(false);

    const handleDownloadLabel = useCallback(async (id) => {
        setDownloadingId(id);
        try {
            await downloadLabelZpl(id);
            toast('Etiqueta descargada', 'success');
        } catch (err) {
            toast(err.message || 'Error al descargar etiqueta', 'error');
        } finally {
            setDownloadingId(null);
        }
    }, []);

    const handleBulkDownloadLabels = useCallback(async (ids) => {
        const shipmentIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
        if (!shipmentIds.length) return;

        setIsDownloadingBulk(true);
        try {
            await downloadLabelsZpl(shipmentIds);
            toast(`${shipmentIds.length} etiquetas descargadas`, 'success');
        } catch (err) {
            toast(err.message || 'Error al descargar etiquetas seleccionadas', 'error');
        } finally {
            setIsDownloadingBulk(false);
        }
    }, []);

    return {
        downloadingId,
        isDownloadingBulk,
        handleDownloadLabel,
        handleBulkDownloadLabels,
    };
}
