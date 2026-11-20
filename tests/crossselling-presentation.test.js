import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Ejecutar los helpers del script real sin inicializar requests ni observadores del navegador.
function loadPresentation(document) {
  const source = readFileSync(new URL('../public/cross-selling/completa-tu-equipo.js', import.meta.url), 'utf8');
  const start = source.lastIndexOf("  if (typeof LS.on === 'function')");
  assert.ok(start > 0);
  const LS = { store: { id: '78394' }, cart: { items: [
    { item_id: '11', variant_id: '101', name: 'Piano que LS.cart todavía conserva' },
    { item_id: '22', variant_id: '202', name: 'Controlador MIDI' },
  ] } };
  const context = { window: { LS }, LS, document: {
    createElement: () => ({}), head: { appendChild() {} }, ...document,
  } };
  return runInNewContext(source.slice(0, start) +
    '  globalThis.presentation = { pruneCartOffers, offerGroups };\n})();\npresentation;', context);
}

function cartDOM(ids, { notice = false } = {}) {
  let removed = false;
  const groups = ids.map(id => ({ getAttribute: () => id, parentNode: null }));
  const box = {
    parentNode: { removeChild: () => { removed = true; } },
    querySelectorAll: () => [...groups],
    querySelector: () => groups[0] || (notice ? {} : null),
    removeChild(group) { groups.splice(groups.indexOf(group), 1); },
  };
  groups.forEach(group => { group.parentNode = box; });
  const visible = new Set(ids);
  return {
    groups, visible, removed: () => removed,
    querySelector(selector) {
      if (selector === '.cte-native') return removed ? null : box;
      const match = selector.match(/^\.js-cart-item\[data-item-id="(\d+)"\]$/);
      return match && visible.has(match[1]) ? {} : null;
    },
  };
}

test('presentación: retirar un principal por AJAX elimina sólo sus ofertas aunque LS.cart siga desactualizado', () => {
  const dom = cartDOM(['11', '22']);
  const presentation = loadPresentation(dom);
  const html = presentation.offerGroups([
    { triggerLineId: '11', variantId: '301', name: 'Soporte', discountedPrice: 90, savings: 10, pct: 10 },
    { triggerLineId: '22', variantId: '302', name: 'Auriculares', discountedPrice: 90, savings: 10, pct: 10 },
  ], true);
  assert.ok(html.includes('data-cte-trigger-line="11"'));
  assert.ok(html.includes('data-cte-trigger-line="22"'));
  dom.visible.delete('11');
  presentation.pruneCartOffers();
  assert.deepEqual(dom.groups.map(group => group.getAttribute()), ['22']);
  assert.equal(dom.removed(), false);
});

test('presentación: retirar el último principal elimina el bloque vacío y conserva un aviso aún confirmado', () => {
  for (const notice of [false, true]) {
    const dom = cartDOM(['11'], { notice });
    const presentation = loadPresentation(dom);
    dom.visible.clear();
    presentation.pruneCartOffers();
    assert.equal(dom.groups.length, 0);
    assert.equal(dom.removed(), !notice);
  }
});
