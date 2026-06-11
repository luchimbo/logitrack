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
export function renderPrintWindow(win, url) {
    if (!win) return;
    try {
        const doc = win.document;
        doc.title = "Imprimir etiqueta";
        doc.body.style.margin = "0";
        doc.body.innerHTML = "";

        const iframe = doc.createElement("iframe");
        iframe.style.border = "0";
        iframe.style.width = "100%";
        iframe.style.height = "100vh";
        iframe.src = url;

        const triggerPrint = () => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                /* el PDF igual queda visible para imprimir manualmente */
            }
        };
        iframe.addEventListener("load", () => setTimeout(triggerPrint, 300));
        doc.body.appendChild(iframe);
        // Respaldo por si el evento load del PDF no dispara.
        setTimeout(triggerPrint, 2500);
    } catch (e) {
        // Último recurso: navegar la ventana directo al PDF.
        try { win.location.href = url; } catch (err) { /* noop */ }
    }
}
