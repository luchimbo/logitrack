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
// Navegar directo a la URL de la API evita los problemas de blob: entre ventanas.
export function renderPrintWindow(win, url) {
    if (!win) return;
    const safeUrl = String(url).replace(/"/g, "%22");
    win.document.open();
    win.document.write(
        "<!doctype html><html><head><meta charset='utf-8'><title>Imprimir etiqueta</title>" +
        "<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100vh}</style></head>" +
        "<body><iframe id='lbl' src=\"" + safeUrl + "\"></iframe>" +
        "<script>(function(){var f=document.getElementById('lbl');" +
        "function p(){try{f.contentWindow.focus();f.contentWindow.print();}catch(e){}}" +
        "f.addEventListener('load',function(){setTimeout(p,300);});" +
        "setTimeout(p,2500);})();<\/script>" +
        "</body></html>"
    );
    win.document.close();
}
