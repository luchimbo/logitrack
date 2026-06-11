import { toast } from "@/lib/api";

// Abre una ventana/pestaña de impresión de forma SÍNCRONA (dentro del gesto del clic).
// Debe llamarse directamente en el handler del botón, antes de cualquier await, para que
// el bloqueador de popups no la cancele. Devuelve la ventana (o null si fue bloqueada).
export function openPrintWindow() {
    const win = window.open("", "_blank");
    if (!win) {
        toast("El navegador bloqueó la ventana de impresión. Permití popups para este sitio.", "error");
        return null;
    }
    win.document.write(
        "<!doctype html><html><head><meta charset='utf-8'><title>Etiqueta</title></head>" +
        "<body style='font-family:sans-serif;color:#444;padding:24px'>Generando etiqueta…</body></html>"
    );
    win.document.close();
    return win;
}

// Carga un PDF (una o varias etiquetas) en la ventana indicada y dispara la impresión.
// `win` debe venir de openPrintWindow() llamado en el clic. Si no se pasa, se intenta abrir
// (puede ser bloqueado si ya hubo un await previo).
export async function printPdfFromUrl(url, fetchOptions = {}, win = undefined) {
    const targetWin = win === undefined ? openPrintWindow() : win;
    if (!targetWin) return false;
    try {
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || data.detail || "No se pudo generar el PDF");
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Cargar el PDF en la ventana y abrir el diálogo de impresión al terminar de cargar.
        targetWin.location.href = blobUrl;
        const triggerPrint = () => {
            try {
                targetWin.focus();
                targetWin.print();
            } catch (e) {
                /* el visor de PDF igual queda visible para imprimir manualmente */
            }
        };
        targetWin.onload = triggerPrint;
        // Respaldo: algunos navegadores no disparan onload al cargar un blob PDF.
        setTimeout(triggerPrint, 1200);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return true;
    } catch (err) {
        try { targetWin.close(); } catch (e) { /* noop */ }
        toast(err.message || "Error al generar el PDF de impresión", "error");
        return false;
    }
}
