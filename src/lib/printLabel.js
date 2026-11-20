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

// Carga el PDF de la etiqueta dentro de la ventana indicada usando un <iframe> al endpoint
// (mismo origen, con cookies) y dispara el diálogo de impresión al terminar de cargar.
// Se manipula el DOM del popup directamente (mismo origen) en vez de document.write para
// máxima compatibilidad; navegar al endpoint evita los problemas de blob: entre ventanas.
export async function renderPrintWindow(win, url, { onConfirmPrinted } = {}) {
    if (!win) throw new Error("No se pudo abrir la ventana de impresión");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "No se pudo preparar el PDF de etiquetas");
        }
        if (!(response.headers.get("content-type") || "").includes("application/pdf")) {
            throw new Error("La respuesta no contiene un PDF de etiquetas");
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const doc = win.document;
        doc.title = "Etiquetas";
        doc.body.style.margin = "0";
        doc.body.innerHTML = "";
        const bar = doc.createElement("div");
        bar.style.cssText = "padding:8px;font-family:sans-serif";
        const link = doc.createElement("a");
        link.href = blobUrl;
        link.download = "etiquetas.pdf";
        link.textContent = "Descargar PDF";
        bar.appendChild(link);
        if (onConfirmPrinted) {
            const confirmButton = doc.createElement("button");
            confirmButton.textContent = "Confirmar que se imprimieron";
            confirmButton.style.marginLeft = "16px";
            confirmButton.addEventListener("click", async () => {
                confirmButton.disabled = true;
                try {
                    await onConfirmPrinted();
                    confirmButton.textContent = "Impresión confirmada";
                } catch {
                    confirmButton.disabled = false;
                    confirmButton.textContent = "No se pudo confirmar. Reintentar";
                }
            });
            bar.appendChild(confirmButton);
        }
        const iframe = doc.createElement("iframe");
        iframe.style.cssText = "border:0;width:100%;height:90vh";
        iframe.title = "PDF de etiquetas";
        iframe.src = blobUrl;
        iframe.addEventListener("load", () => {
            try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* Usar el visor de PDF. */ }
        }, { once: true });
        doc.body.append(bar, iframe);
        win.addEventListener("beforeunload", () => URL.revokeObjectURL(blobUrl), { once: true });
    } catch (error) {
        const message = error.name === "AbortError" ? "La preparación tardó demasiado. Intentá nuevamente con menos etiquetas." : (error.message || "No se pudo preparar la impresión");
        try { win.document.body.textContent = message; } catch { /* La ventana puede haberse cerrado. */ }
        throw new Error(message);
    } finally {
        clearTimeout(timer);
    }
}
