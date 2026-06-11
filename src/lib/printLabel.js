import { toast } from "@/lib/api";

// Imprime un PDF (una o varias etiquetas) abriendo el dialogo de impresion del navegador.
// Se descarga el PDF, se carga en un <iframe> oculto y se dispara print() al terminar de
// cargar. Asi el usuario elige la impresora (p. ej. la Zebra ZD420) sin depender del agente.
export async function printPdfFromUrl(url, fetchOptions = {}) {
    let blobUrl = null;
    try {
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || data.detail || "No se pudo generar el PDF");
        }
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);

        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.src = blobUrl;

        iframe.onload = () => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (err) {
                // Fallback: abrir en ventana nueva si el iframe no permite imprimir
                window.open(blobUrl, "_blank");
            }
            // Liberar recursos despues de que el dialogo haya tenido tiempo de abrirse
            setTimeout(() => {
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                iframe.remove();
            }, 60000);
        };

        document.body.appendChild(iframe);
        return true;
    } catch (err) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        toast(err.message || "Error al generar el PDF de impresion", "error");
        return false;
    }
}
