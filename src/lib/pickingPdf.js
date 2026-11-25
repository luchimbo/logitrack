// Dibuja la lista de picking en un documento jsPDF (A4, medidas en mm).
// Cada cuadro crece según el contenido para que el título entre completo.
import { getPickingAccessories } from "./pickingAccessories.js";

const MARGIN = 7;
const GAP = 3;
const COLUMNS = 2;
const TEXT_LEFT = 17;
const PADDING_RIGHT = 3;

const TITLE = { size: 10.5, line: 4.5, style: "bold", color: [20, 24, 35] };
const COLOR = { size: 10, line: 4.6, style: "bold", color: [20, 24, 35] };
const DETAIL = { size: 8, line: 3.7, style: "normal", color: [90, 99, 116] };
const ACCESSORY = { size: 9, line: 4.1, style: "bold", color: [180, 83, 9] };

// Muestra de color al lado del nombre, para ubicarlo de un vistazo.
const SWATCHES = [
    [/negro|black|noir/, [20, 20, 20]],
    [/blanco|white/, [255, 255, 255]],
    [/gris|gray|grey|grafito/, [140, 140, 140]],
    [/plata|plateado|silver/, [200, 203, 208]],
    [/rojo|red\b|bordo/, [200, 30, 40]],
    [/azul|blue/, [35, 90, 200]],
    [/celeste/, [120, 190, 235]],
    [/verde|green/, [40, 150, 80]],
    [/amarillo|yellow/, [245, 205, 40]],
    [/naranja|orange/, [240, 130, 30]],
    [/rosa|pink/, [240, 130, 175]],
    [/violeta|morado|lila|purple/, [130, 70, 180]],
    [/marron|brown|madera/, [130, 85, 50]],
    [/beige|crema/, [225, 208, 175]],
    [/dorado|gold/, [200, 165, 60]],
];

function swatchFor(color) {
    const value = color.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    // Con varios colores en el mismo envío no hay una sola muestra que mostrar.
    if (value.includes(",")) return null;
    return SWATCHES.find(([pattern]) => pattern.test(value))?.[1] || null;
}

function setStyle(pdf, style) {
    pdf.setFont("helvetica", style.style);
    pdf.setFontSize(style.size);
    pdf.setTextColor(...style.color);
}

function wrap(pdf, text, width, style) {
    setStyle(pdf, style);
    return pdf.splitTextToSize(String(text), width);
}

function layoutItem(pdf, item, width) {
    const textWidth = width - TEXT_LEFT - PADDING_RIGHT;
    const color = String(item.color || "").trim();
    const swatch = color ? swatchFor(color) : null;
    const colorWidth = textWidth - (swatch ? 5.5 : 0);
    const envios = `${item.shipment_count} envío${item.shipment_count === 1 ? "" : "s"}`;

    const blocks = [
        { style: TITLE, lines: wrap(pdf, item.product_name || "Producto sin nombre", textWidth, TITLE) },
        color && { style: COLOR, lines: wrap(pdf, `Color: ${color}`, colorWidth, COLOR), swatch },
        { style: DETAIL, lines: wrap(pdf, `SKU ${item.sku || "N/A"} · ${envios}`, textWidth, DETAIL) },
        ...getPickingAccessories(item).map((accessory) => (
            { style: ACCESSORY, lines: wrap(pdf, `+ ${accessory}`, textWidth, ACCESSORY) }
        )),
    ].filter(Boolean);

    const textHeight = blocks.reduce((sum, block) => sum + (block.lines.length * block.style.line) + 1, 0);

    return { quantity: item.total_quantity, blocks, height: Math.max(textHeight + 3, 18) };
}

function drawItem(pdf, layout, x, top, width, height) {
    pdf.setDrawColor(190, 200, 214);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x, top, width, height, 1.5, 1.5);

    pdf.setDrawColor(90, 99, 116);
    pdf.rect(x + 2.5, top + 2.5, 5, 5);

    pdf.setFillColor(99, 102, 241);
    pdf.roundedRect(x + 2.5, top + 9, 11.5, 7, 1.2, 1.2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(layout.quantity), x + 8.25, top + 14, { align: "center" });

    let y = top + 1.5;
    for (const block of layout.blocks) {
        let textX = x + TEXT_LEFT;
        if (block.swatch) {
            pdf.setFillColor(...block.swatch);
            pdf.setDrawColor(60, 66, 80);
            pdf.circle(textX + 1.8, y + 2.4, 1.8, "FD");
            textX += 5.5;
        }
        setStyle(pdf, block.style);
        for (const line of block.lines) {
            pdf.text(line, textX, y + (block.style.line * 0.78));
            y += block.style.line;
        }
        y += 1;
    }
}

export function renderPickingPdf(pdf, { items, generatedAt }) {
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (MARGIN * 2);
    const columnWidth = (contentWidth - (GAP * (COLUMNS - 1))) / COLUMNS;
    const bottom = pageHeight - 8;
    let y = 11;

    const addPageIfNeeded = (requiredHeight) => {
        if (y + requiredHeight <= bottom) return;
        pdf.addPage();
        y = 10;
    };

    const units = (list) => list.reduce((sum, item) => sum + item.total_quantity, 0);
    const colecta = items.filter((item) => item.shipping_method === "colecta");
    const flex = items.filter((item) => item.shipping_method === "flex");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(20, 24, 35);
    pdf.text("Picking", MARGIN, y);
    y += 5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(90, 99, 116);
    pdf.text(`Generado: ${generatedAt}`, MARGIN, y);
    y += 5;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(20, 24, 35);
    pdf.text(`Productos: ${items.length}   ·   Unidades: ${units(items)}   ·   Colecta: ${colecta.length}/${units(colecta)}   ·   Flex: ${flex.length}/${units(flex)}`, MARGIN, y);
    y += 4;

    const sections = [
        { title: "Colecta", list: colecta, fill: [245, 158, 11] },
        { title: "Flex", list: flex, fill: [99, 102, 241] },
    ];

    for (const { title, list, fill } of sections) {
        if (!list.length) continue;

        const layouts = list.map((item) => layoutItem(pdf, item, columnWidth));
        const rows = [];
        for (let i = 0; i < layouts.length; i += COLUMNS) {
            const cells = layouts.slice(i, i + COLUMNS);
            rows.push({ cells, height: Math.max(...cells.map((cell) => cell.height)) });
        }

        // El encabezado no puede quedar solo al pie de la página.
        addPageIfNeeded(10 + rows[0].height);
        pdf.setFillColor(...fill);
        pdf.roundedRect(MARGIN, y, contentWidth, 7, 1.5, 1.5, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(255, 255, 255);
        pdf.text(`${title} · ${list.length} productos · ${units(list)} uds`, MARGIN + 2.5, y + 4.9);
        y += 9.5;

        for (const row of rows) {
            addPageIfNeeded(row.height);
            row.cells.forEach((cell, column) => {
                drawItem(pdf, cell, MARGIN + (column * (columnWidth + GAP)), y, columnWidth, row.height);
            });
            y += row.height + GAP;
        }
    }

    return pdf;
}
