import test from "node:test";
import assert from "node:assert/strict";
import { getPickingAccessories } from "../src/lib/pickingAccessories.js";

const get = (product_name, sku = null) => getPickingAccessories({ product_name, sku });

test("asigna la fuente por SKU y por nombre", () => {
    assert.deepEqual(get("Teclado Musical Meike Mk-4100 49 Teclas", "MKT015"), ["Fuente 9V 500 mA · 5.5×2.1 mm"]);
    assert.deepEqual(get("Piano Eléctrico Meike Mk 885 88 Teclas"), ["Fuente 12V 500 mA · 5.5×2.1 mm"]);
    assert.deepEqual(get("Arturia Minibrute 2 Noir Sintetizador"), ["Fuente 12V 2.5A · 5.5×2.1 mm"]);
    assert.deepEqual(get("Arturia MiniBrute"), ["Fuente 12V 1A · 5.5×2.1 mm"]);
    assert.deepEqual(get("Teclado Sinte Arturia Astrolab 37"), ["Fuente 12V 2A · 5.5×2.5 mm"]);
    assert.deepEqual(get("Arturia AudioFuse 16Rig"), ["Fuente 15V 3A · 5.5×2.5 mm"]);
    assert.deepEqual(get("Arturia PolyBrute 12"), ["Cable interlock (Schuko)"]);
});

test("Kressmer: 9V 2A, K88 12V 2A y 3008 sin nada", () => {
    assert.deepEqual(get("Piano Digital Kressmer Lm-200 88 Teclas", "KRE001"), ["Fuente 9V 2A"]);
    assert.deepEqual(get("Piano Digital Kressmer K180 88 Teclas"), ["Fuente 9V 2A"]);
    assert.deepEqual(get("Piano Digital Kressmer K88 88 Teclas Hammer"), ["Fuente 12V 2A"]);
    assert.deepEqual(get("Piano Digital Kressmer 3008 88 Sensitivo", "KRE006"), []);
});

test("no agrega fuente a lo que no está en el listado ni a accesorios", () => {
    assert.deepEqual(get("Piano Digital 88 Teclas Meike Mk-8861", "MKT033"), ["Fuente 12V 500 mA"]);
    assert.deepEqual(get("Batería Electrónica Midiplus Md10d", "MOI002"), []);
    assert.deepEqual(get("Batería Electrónica Midiplus Md10l", "MOI001"), []);
    assert.deepEqual(get("Placa De Sonido Midiplus V8 Usb", "ENP020"), []);
    assert.deepEqual(get("Arturia AstroLab 88"), ["Fuente 12V 3A · 5.5×2.5 mm"]);
    assert.deepEqual(get("Secuenciador Midi Arturia Keystep 37 Mk2", "ZTO168"), []);
    assert.deepEqual(get("Placa Interfaz De Audio Arturia Minifuse 2", "ZTO018"), []);
    assert.deepEqual(get("Micrófono Cuello De Cisne Arturia Microfreak Vocoder", "ZTO169"), []);
    assert.deepEqual(get("Atril Para Partituras Arturia Astrolab 61", "ZTO149"), []);
    assert.deepEqual(get("Software Arturia Minifreak V Licencia Oficial Original", "ZFO051"), []);
});

test("lista cada producto de un envío combinado", () => {
    assert.deepEqual(
        get("Batería Electrónica Midiplus Ed6 ... | Filtro Antipop", "ZRR068 | AIS020"),
        ["Fuente 9V 1A · 5.5×2.1 mm"],
    );
    assert.equal(get("Meike Mk-939 | Meike Mk-4300", "MKT001 | MKT008").length, 2);
});
