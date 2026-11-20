import { PDFDocument, PageSizes } from 'pdf-lib';
import { extractLabelDimensionsInches } from './labelDimensions.js';

export async function arrangeLabelsOnA4(bytes) {
    const source = await PDFDocument.load(bytes);
    const output = await PDFDocument.create();
    const [width, height] = PageSizes.A4;
    const margin = 9;
    const gap = 10;
    const columnWidth = (width - 2 * margin - gap) / 2;

    for (let i = 0; i < source.getPageCount(); i += 2) {
        const sheet = output.addPage(PageSizes.A4);
        for (let column = 0; column < 2 && i + column < source.getPageCount(); column++) {
            const label = await output.embedPage(source.getPage(i + column));
            const scale = Math.min(1, columnWidth / label.width, (height - 2 * margin) / label.height);
            const size = label.scale(scale);
            sheet.drawPage(label, {
                ...size,
                x: margin + column * (columnWidth + gap) + (columnWidth - size.width) / 2,
                y: height - margin - size.height,
            });
        }
    }
    return Buffer.from(await output.save());
}

// Divide un ZPL con varias etiquetas concatenadas en bloques individuales ^XA ... ^XZ y
// descarta los bloques vacíos (ML a veces agrega un ^XA^XZ sin contenido que, si se renderiza,
// produce una página en blanco).
function splitZplLabels(zpl) {
    const blocks = (zpl.match(/\^XA[\s\S]*?\^XZ/g) || []).filter((b) => /\^(?:FD|GF|GB|GC|GD|GE|XG)/i.test(b));
    return blocks.length ? blocks : [zpl];
}

async function renderZplBatchPdf(zpl, signal = AbortSignal.timeout(25000), size) {
    const labelaryUrl = `https://api.labelary.com/v1/printers/8dpmm/labels/${size}/`;
    const attemptHeaders = [
        { Accept: 'application/pdf', 'Content-Type': 'application/x-www-form-urlencoded' },
        { Accept: 'application/pdf', 'Content-Type': 'text/plain' },
    ];
    let response = null;
    for (const headers of attemptHeaders) {
        response = await fetch(labelaryUrl, { method: 'POST', headers, body: zpl, signal });
        if (response.ok || response.status !== 415) break;
    }
    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Labelary: ${errorText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

// Renderiza cada etiqueta en una página de dimensiones suficientes para su contenido.
export async function zplToPdf(zpl, signal) {
    const labels = splitZplLabels(zpl);
    const merged = await PDFDocument.create();
    const batches = [];
    for (const label of labels) {
        const { width, height } = extractLabelDimensionsInches(label);
        const size = `${width}x${height}`;
        const last = batches.at(-1);
        if (last?.size === size && last.labels.length < 50) {
            last.labels.push(label);
        } else {
            batches.push({ size, labels: [label] });
        }
    }
    for (const batch of batches) {
        const bytes = await renderZplBatchPdf(batch.labels.join('\r\n'), signal, batch.size);
        const src = await PDFDocument.load(bytes);
        if (src.getPageCount() !== batch.labels.length) throw new Error('Cantidad de etiquetas incompleta');
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const page of pages) merged.addPage(page);
    }
    return Buffer.from(await merged.save());
}
