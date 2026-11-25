import test from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { renderPickingPdf } from "../src/lib/pickingPdf.js";

test("el PDF muestra el título completo y el color", () => {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const written = [];
    const text = pdf.text.bind(pdf);
    pdf.text = (value, ...rest) => {
        written.push(value);
        return text(value, ...rest);
    };
    const name = "Teclado Controlador Midi Usb Arturia Keylab Essential 61 Mk3 Con Software Incluido Edición Especial";

    renderPickingPdf(pdf, {
        generatedAt: "hoy",
        items: [{ product_name: name, sku: "ABC1", color: "Negro", shipping_method: "flex", total_quantity: 2, shipment_count: 1 }],
    });

    const output = written.join(" ");
    assert.ok(output.includes("Edición Especial"));
    assert.ok(!output.includes("..."));
    assert.ok(output.includes("Color: Negro"));
});
