export function openPrintDialog() {
    const dialog = document.createElement("dialog");
    dialog.className = "label-print-dialog card";
    dialog.setAttribute("aria-label", "Imprimir etiquetas");
    dialog.style.cssText = "width:min(680px,calc(100% - 24px));max-height:94vh;color:var(--text);background:var(--bg-secondary);overflow:auto";
    const header = document.createElement("div");
    header.className = "flex-between";
    const title = document.createElement("h2");
    title.textContent = "Imprimir etiquetas";
    header.append(title, button("Cerrar", () => dialog.close()));
    const body = document.createElement("div");
    dialog.append(header, body);
    document.body.append(dialog);

    const cancel = new AbortController();
    dialog.addEventListener("close", () => {
        cancel.abort();
        dialog.remove();
    }, { once: true });
    dialog.showModal();
    return {
        dialog,
        body,
        signal: cancel.signal,
        close: () => dialog.close(),
        get closed() { return !dialog.open; },
    };
}

function button(label, onClick) {
    const control = document.createElement("button");
    control.type = "button";
    control.className = "btn btn-sm";
    control.textContent = label;
    control.onclick = onClick;
    return control;
}

export function chooseLabelPrintFormat(panel) {
    return new Promise((resolve) => {
        panel.dialog.addEventListener("close", () => resolve(null), { once: true });
        const options = [
            ["thermal", "PDF térmico", "Una etiqueta por página, seguidas en un solo PDF."],
            ["pdf", "PDF para A4", "Agrupa hasta cuatro etiquetas por hoja según su tamaño."],
            ["zpl", "ZPL", "Un archivo con las etiquetas en secuencia."],
        ];
        panel.body.style.cssText = "display:grid;gap:10px;margin-top:14px";
        for (const [format, label, description] of options) {
            const option = button(label, () => {
                const status = document.createElement("p");
                status.setAttribute("role", "status");
                status.textContent = "Preparando etiquetas…";
                panel.body.replaceChildren(status);
                resolve(format);
            });
            option.style.cssText = "display:grid;gap:4px;text-align:left;padding:10px 12px";
            const detail = document.createElement("span");
            detail.style.fontWeight = "400";
            detail.textContent = description;
            option.append(detail);
            panel.body.append(option);
        }
        panel.body.querySelector("button").focus();
    });
}

export async function downloadLabelZplFile(url, requestOptions, cancelSignal) {
    const deadline = AbortSignal.timeout(55000);
    const signal = cancelSignal ? AbortSignal.any([cancelSignal, deadline]) : deadline;
    const response = await fetch(url, { ...requestOptions, signal });
    if (!response.ok || !(response.headers.get("content-type") || "").includes("application/vnd.zebra-zpl")) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo preparar el ZPL de etiquetas.");
    }
    saveLabelFile(await response.blob(), "etiquetas.zpl");
}

async function fetchLabelPdf(url, requestOptions, cancelSignal) {
    try {
        const deadline = AbortSignal.timeout(55000);
        const signal = cancelSignal ? AbortSignal.any([cancelSignal, deadline]) : deadline;
        const response = await fetch(url, { ...requestOptions, signal });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "No se pudo preparar el PDF de etiquetas");
        }
        if (!(response.headers.get("content-type") || "").includes("application/pdf")) {
            throw new Error("La respuesta no contiene un PDF de etiquetas");
        }
        return await response.blob();
    } catch (error) {
        if (["AbortError", "TimeoutError"].includes(error.name)) {
            throw new Error("La preparación tardó demasiado. Intentá nuevamente con menos etiquetas.");
        }
        throw error;
    }
}

export async function downloadLabelPdf(url, requestOptions) {
    saveLabelFile(await fetchLabelPdf(url, requestOptions), "etiquetas-mercadolibre.pdf");
}

function saveLabelFile(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export async function renderPrintDialog(panel, url, { onConfirmPrinted, requestOptions } = {}) {
    if (panel.closed) return;
    const blob = await fetchLabelPdf(url, requestOptions, panel.signal);
    if (panel.closed) return;
    const blobUrl = URL.createObjectURL(blob);
    panel.dialog.addEventListener("close", () => URL.revokeObjectURL(blobUrl), { once: true });
    panel.dialog.style.width = "min(1080px,calc(100% - 24px))";

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "border:0;width:100%;height:68dvh;background:white";
    iframe.title = "Vista previa del PDF de etiquetas";
    iframe.src = blobUrl;

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
    const print = button("Imprimir PDF", () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch {
            print.textContent = "Usá Imprimir en el visor";
        }
    });
    print.disabled = true;
    iframe.addEventListener("load", () => { print.disabled = false; }, { once: true });

    const link = document.createElement("a");
    link.className = "btn btn-sm";
    link.href = blobUrl;
    link.download = "etiquetas.pdf";
    link.textContent = "Descargar PDF";
    toolbar.append(print, link);
    if (onConfirmPrinted) {
        const confirm = button("Confirmar impresión", async () => {
            confirm.disabled = true;
            try {
                await onConfirmPrinted();
                confirm.textContent = "Impresión confirmada";
            } catch {
                confirm.disabled = false;
                confirm.textContent = "Reintentar confirmación";
            }
        });
        toolbar.append(confirm);
    }
    panel.body.replaceChildren(toolbar, iframe);
    link.focus();
}
