import { PDFDocument, PageSizes } from 'pdf-lib';
import { extractLabelDimensionsInches } from './labelDimensions.js';

const margin = 9;
const gap = 10;
const minimumScale = 0.88;

function chooseA4Layout(pages) {
    const [width, height] = PageSizes.A4;
    const grids = [
        { size: [width, height], columns: 2, rows: 2 },
        { size: [height, width], columns: 3, rows: 1 },
        { size: [width, height], columns: 2, rows: 1 },
        { size: [width, height], columns: 1, rows: 1 },
    ];
    const layouts = grids.map((grid) => {
        const [w, h] = grid.size;
        const cellWidth = (w - 2 * margin - (grid.columns - 1) * gap) / grid.columns;
        const cellHeight = (h - 2 * margin - (grid.rows - 1) * gap) / grid.rows;
        const count = Math.min(pages.length, grid.columns * grid.rows);
        const scale = Math.min(1, ...pages.slice(0, count).map((page) =>
            Math.min(cellWidth / page.getWidth(), cellHeight / page.getHeight())));
        return { ...grid, cellWidth, cellHeight, count, scale };
    });
    return layouts.filter((layout) => layout.scale >= minimumScale || layout.columns * layout.rows === 1)
        .sort((a, b) => b.count - a.count || b.scale - a.scale)[0];
}

export async function arrangeLabelsOnA4(bytes) {
    const source = await PDFDocument.load(bytes);
    const output = await PDFDocument.create();
    const pages = source.getPages();

    for (let i = 0; i < pages.length;) {
        const layout = chooseA4Layout(pages.slice(i, i + 4));
        const sheet = output.addPage(layout.size);
        for (let slot = 0; slot < layout.count; slot++) {
            const label = await output.embedPage(pages[i + slot]);
            const size = label.scale(layout.scale);
            const column = slot % layout.columns;
            const row = Math.floor(slot / layout.columns);
            sheet.drawPage(label, {
                ...size,
                x: margin + column * (layout.cellWidth + gap) + (layout.cellWidth - size.width) / 2,
                y: sheet.getHeight() - margin - row * (layout.cellHeight + gap) - size.height,
            });
        }
        i += layout.count;
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
