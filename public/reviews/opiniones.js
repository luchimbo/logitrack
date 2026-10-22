// Opiniones de productos · tiendas habilitadas en Logitrack (demo 7570182 y PC MIDI 78394).
// Lo carga «Completá tu equipo» junto al script del módulo. Si el producto no tiene opiniones
// publicadas (o el módulo está apagado en Mostrador) no agrega nada a la página.
(function () {
  'use strict';
  var STORES = ['7570182', '78394'];
  var API = 'https://www.geomodi.ai/api/reviews/storefront';
  var PAGE = 5;
  var SOURCES = { mercadolibre: 'MercadoLibre', google: 'Google', cliente: 'Cliente de PC MIDI' };
  var store = window.LS && LS.store ? String(LS.store.id) : '';
  if (STORES.indexOf(store) < 0 || window.__opinionesProducto) return;
  if (!LS.product || !document.body || !/template-product/.test(document.body.className)) return;
  window.__opinionesProducto = true;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var skus = (LS.variants || []).map(function (v) { return v && v.sku ? String(v.sku).trim() : ''; })
    .filter(function (s, i, a) { return s && a.indexOf(s) === i; });
  if (!skus.length) return;

  function stars(avg) {
    var pct = Math.max(0, Math.min(100, (avg / 5) * 100));
    return '<span class="op-stars" role="img" aria-label="' + avg.toString().replace('.', ',') + ' de 5 estrellas">' +
      '<span class="op-stars-bg" aria-hidden="true">★★★★★</span>' +
      '<span class="op-stars-fg" aria-hidden="true" style="width:' + pct + '%">★★★★★</span></span>';
  }
  function date(iso) {
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }
  function plural(n) { return n + (n === 1 ? ' opinión' : ' opiniones'); }
  function addStyles() {
    var css = document.createElement('style');
    css.textContent =
      '.op-stars{position:relative;display:inline-block;white-space:nowrap;line-height:1;font-size:1.05em;letter-spacing:1px}' +
      '.op-stars-bg{color:#d3d3d3}.op-stars-fg{position:absolute;left:0;top:0;overflow:hidden;color:#f5a623}' +
      '.op-resumen{display:inline-flex;align-items:center;gap:8px;margin:4px 0 12px;color:inherit;text-decoration:none;font-size:.9em}' +
      '.op-resumen:hover span.op-n{text-decoration:underline}' +
      '#opiniones-producto{margin:32px 0;padding-top:24px;border-top:1px solid rgba(128,128,128,.3)}' +
      '#opiniones-producto h2{font-size:1.3em;margin:0 0 8px}' +
      '.op-total{display:flex;align-items:center;gap:10px;margin-bottom:16px;font-size:1.05em}' +
      '.op-item{padding:14px 0;border-top:1px solid rgba(128,128,128,.2)}' +
      '.op-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-bottom:6px;font-size:.9em}' +
      '.op-texto{margin:0;white-space:pre-line}' +
      '.op-origen{display:inline-block;margin-top:6px;font-size:.8em;opacity:.7}' +
      '.op-origen a{color:inherit;text-decoration:underline}' +
      '.op-mas{margin-top:12px;padding:8px 16px;border:1px solid currentColor;background:transparent;color:inherit;border-radius:6px;cursor:pointer}';
    document.head.appendChild(css);
  }
  function render(data) {
    if (!data || !data.enabled || !data.count || !data.reviews || !data.reviews.length) return;
    addStyles();
    var title = document.querySelector('h1.js-product-name') || document.querySelector('h1');
    if (title) {
      var sum = document.createElement('a');
      sum.className = 'op-resumen'; sum.href = '#opiniones-producto';
      sum.innerHTML = stars(data.avg) + '<span class="op-n">' + data.avg.toString().replace('.', ',') + ' · ' + plural(data.count) + '</span>';
      title.insertAdjacentElement('afterend', sum);
    }
    var box = document.createElement('section');
    box.id = 'opiniones-producto';
    box.innerHTML = '<h2>Opiniones de clientes</h2><div class="op-total">' + stars(data.avg) +
      '<span><b>' + data.avg.toString().replace('.', ',') + '</b> de 5 · ' + plural(data.count) + '</span></div><div class="op-lista"></div>';
    var list = box.querySelector('.op-lista'), shown = 0, more = null;
    function showMore() {
      var html = '';
      data.reviews.slice(shown, shown + PAGE).forEach(function (r) {
        var label = SOURCES[r.origen] || 'Cliente';
        var origin = r.enlace && /^https:\/\//.test(r.enlace)
          ? '<a href="' + esc(r.enlace) + '" target="_blank" rel="noopener noreferrer nofollow">Opinión en ' + esc(label) + '</a>'
          : 'Opinión de ' + esc(label);
        html += '<article class="op-item"><div class="op-head">' + stars(r.rating) + '<b>' + esc(r.autor) + '</b><span>' + esc(date(r.fecha)) + '</span></div>' +
          '<p class="op-texto">' + esc(r.texto) + '</p><span class="op-origen">' + origin + '</span></article>';
      });
      list.insertAdjacentHTML('beforeend', html);
      shown = Math.min(data.reviews.length, shown + PAGE);
      if (more && shown >= data.reviews.length) more.remove();
    }
    if (data.reviews.length > PAGE) {
      more = document.createElement('button');
      more.type = 'button'; more.className = 'op-mas'; more.textContent = 'Ver más opiniones';
      more.addEventListener('click', showMore);
      box.appendChild(more);
    }
    showMore();
    var desc = document.getElementById('product-description') || document.querySelector('.product-description');
    var anchor = desc && (desc.closest('.row') || desc);
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    else (document.querySelector('main') || document.body).appendChild(box);
  }

  var url = API + '?store=' + encodeURIComponent(store) + '&skus=' + encodeURIComponent(skus.join(','));
  fetch(url, { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(render).catch(function () { /* sin opiniones */ });
})();
