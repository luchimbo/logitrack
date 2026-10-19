// «Completá tu equipo» · tiendas habilitadas en Logitrack (demo 7570182 y PC MIDI 78394).
// Lo carga el script registrado en Partners. No depende del JavaScript del tema.
(function () {
  'use strict';
  var STORES = ['7570182', '78394'];
  var API = 'https://www.geomodi.ai/api/cross-selling/storefront/';
  var STORE = window.LS && LS.store ? String(LS.store.id) : '';
  if (STORES.indexOf(STORE) < 0 || window.__completaTuEquipo) return;
  window.__completaTuEquipo = true;
  // Abrir la conexión con la API apenas carga el script, antes de la primera consulta.
  try {
    var hint = document.createElement('link');
    hint.rel = 'preconnect'; hint.href = 'https://www.geomodi.ai'; hint.crossOrigin = 'anonymous';
    document.head.appendChild(hint);
  } catch (e) { /* sin preconexión */ }

  var money = function (n) {
    try { return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch (e) { return '$' + Number(n).toFixed(2); }
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  };

  function cartItems() {
    var items = (LS.cart && LS.cart.items) || [];
    return items.filter(function (i) { return i && i.item_id && (i.variant_id || i.id); });
  }
  // Al cargar la página los ítems no traen cart_id; sólo LS.cart.id. Después de agregar, al revés.
  function cartId() {
    var i = cartItems()[0];
    var id = (i && i.cart_id) || (LS.cart && LS.cart.id);
    return id ? String(id) : '';
  }

  var css = [
    '.cte-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483000;display:flex;align-items:flex-end;justify-content:center}',
    '@media(min-width:720px){.cte-overlay{align-items:center}}',
    '.cte-modal{background:#fff;color:#111827;width:100%;max-width:640px;max-height:90vh;overflow:auto;border-radius:16px 16px 0 0;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3);font:inherit}',
    '@media(min-width:720px){.cte-modal{border-radius:16px}}',
    '.cte-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}',
    '.cte-title{font-size:20px;font-weight:700;margin:0}.cte-sub{margin:4px 0 0;color:#4b5563;font-size:14px}',
    '.cte-close{background:none;border:0;font-size:26px;line-height:1;cursor:pointer;color:#6b7280;padding:4px 8px}',
    '.cte-list{display:grid;gap:12px}',
    '.cte-card{display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:center;border:1px solid #e5e7eb;border-radius:12px;padding:12px}',
    '.cte-img{width:72px;height:72px;object-fit:contain;border-radius:8px;background:#f3f4f6}',
    '.cte-name{font-weight:600;font-size:15px;margin:0 0 4px}.cte-reason{color:#6b7280;font-size:13px;margin:0 0 6px}',
    '.cte-prices{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:8px}',
    '.cte-old{text-decoration:line-through;color:#9ca3af;font-size:13px}.cte-new{font-weight:700;font-size:17px}',
    '.cte-save{background:#dcfce7;color:#166534;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:600}',
    '.cte-btn{background:#111827;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:600;cursor:pointer;width:100%;font-size:14px}',
    '.cte-btn[disabled]{opacity:.6;cursor:wait}.cte-msg{font-size:13px;margin:6px 0 0}.cte-msg.err{color:#b91c1c}',
    '.cte-inline{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:12px;background:#fff;color:#111827}',
    '.cte-product{margin:16px 0}.cte-product .cte-sub{margin:2px 0 10px}',
    '.cte-native{border:0;padding:0;margin:0 0 24px;background:transparent;color:inherit}.cte-native .cte-row{padding-top:12px}',
    '.cte-native .cte-applied{margin-bottom:16px}.cte-row-msg{margin-top:6px}.cte-row-msg.err{color:#b91c1c}',
    '.cte-applied{display:grid;gap:2px;background:#dcfce7;color:#166534;border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:14px}',
    '.cte-applied b{font-size:15px}',
    '.cte-strike{color:#9ca3af;font-weight:400;margin-right:4px}.cte-final{color:#166534;font-weight:700}',
    '.cte-line-badge{display:block;width:max-content;margin-top:4px;background:#dcfce7;color:#166534;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:600}',
    '.cte-inline .cte-title{font-size:16px}.cte-inline .cte-card{grid-template-columns:56px 1fr;padding:8px}.cte-inline .cte-img{width:56px;height:56px}',
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function fetchOffers(onCached) {
    var items = cartItems();
    if (!items.length) return Promise.resolve([]);
    return requestOffers(items.slice(0, 40).map(function (i) { return (i.variant_id || i.id) + ':' + i.item_id + ':' + (i.quantity || 1); }).join(','), onCached);
  }

  // Las ofertas ya consultadas se dibujan al instante (hasta 2 min) y se renuevan por detrás.
  var OFFERS_TTL_MS = 120000;
  function cachedOffers(q) {
    try {
      var hit = JSON.parse(store.get('cte-offers:' + STORE + ':' + q) || 'null');
      return hit && Date.now() - hit.at < OFFERS_TTL_MS && Array.isArray(hit.offers) ? hit.offers : null;
    } catch (e) { return null; }
  }
  function requestOffers(q, onCached) {
    var hit = cachedOffers(q);
    if (hit && onCached) onCached(hit);
    return fetch(API + 'offers?store=' + STORE + '&items=' + encodeURIComponent(q), { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : { offers: [] }; })
      .then(function (d) {
        var offers = Array.isArray(d.offers) ? d.offers : [];
        store.set('cte-offers:' + STORE + ':' + q, JSON.stringify({ at: Date.now(), offers: offers }));
        return offers;
      })
      .catch(function () { return hit || []; });
  }

  // Informe: avisar una vez por página y bloque qué ofertas (reglas) se mostraron.
  var seen = {};
  function reportSeen(surface, offers) {
    var rules = offers.map(function (o) { return o.ruleId; }).filter(Boolean);
    var key = surface + ':' + offers.map(function (o) { return o.variantId; }).join(',');
    if (!rules.length || seen[key]) return;
    seen[key] = true;
    var body = JSON.stringify({ store: STORE, surface: surface, rules: rules });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(API + 'seen', new Blob([body], { type: 'text/plain' }));
      else fetch(API + 'seen', { method: 'POST', body: body, credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'text/plain' } });
    } catch (e) { /* el informe no debe afectar la compra */ }
  }

  // Mismo renglón que los productos del carrito del tema (grilla, tipografía, precio tachado y botón).
  function nativeRow(o) {
    return '<div class="cte-row row align-items-md-center" data-variant="' + esc(o.variantId) + '">' +
      '<div class="col-3 col-md-1">' + (o.image ? '<img class="img-fluid" alt="" loading="lazy" src="' + esc(o.image) + '">' : '') + '</div>' +
      '<div class="col-9 col-md-11 pl-0 pl-md-3"><div class="row align-items-md-center">' +
        '<h6 class="col-12 col-md-5 h4-md font-weight-normal mb-2 mb-md-0">' + esc(o.name) + (o.variant ? ' <small>' + esc(o.variant) + '</small>' : '') +
          '<div class="mt-2"><span class="d-inline-block label label-accent label-small font-smallest mb-1">-' + esc(o.pct) + '% · Ahorrás ' + money(o.savings) + '</span></div>' +
          (o.reason ? '<div class="font-small opacity-50">' + esc(o.reason) + '</div>' : '') + '</h6>' +
        '<div class="col-6 col-md-3 text-md-center"><div><span class="price-compare font-small opacity-50 mr-0">' + money(o.price) + '</span></div>' +
          '<div class="h4 font-weight-normal mb-0">' + money(o.discountedPrice) + '</div></div>' +
        '<div class="col-6 col-md-4"><button type="button" class="cte-accept btn btn-primary btn-small btn-block">Agregar con descuento</button>' +
          '<p class="cte-row-msg font-small mb-0" role="status"></p></div>' +
      '</div></div>' +
      '<div class="col-12"><div class="divider"></div></div></div>';
  }

  function card(o, label) {
    return '<div class="cte-card" data-variant="' + esc(o.variantId) + '">' +
      (o.image ? '<img class="cte-img" alt="" loading="lazy" src="' + esc(o.image) + '">' : '<div class="cte-img"></div>') +
      '<div><p class="cte-name">' + esc(o.name) + (o.variant ? ' · ' + esc(o.variant) : '') + '</p>' +
      (o.reason ? '<p class="cte-reason">' + esc(o.reason) + '</p>' : '') +
      '<div class="cte-prices"><span class="cte-old">' + money(o.price) + '</span><span class="cte-new">' + money(o.discountedPrice) + '</span>' +
      '<span class="cte-save">Ahorrás ' + money(o.savings) + '</span></div>' +
      '<button type="button" class="cte-btn">' + (label || 'Agregar con descuento') + '</button><p class="cte-msg" role="status"></p></div></div>';
  }

  function bind(root, offers, onAccept) {
    Array.prototype.forEach.call(root.querySelectorAll('.cte-card, .cte-row'), function (el) {
      var offer = offers.filter(function (o) { return String(o.variantId) === el.getAttribute('data-variant'); })[0];
      var btn = el.querySelector('.cte-btn, .cte-accept'), msg = el.querySelector('.cte-msg, .cte-row-msg');
      btn.addEventListener('click', function () { (onAccept || accept)(offer, btn, msg); });
    });
  }

  function addToCart(body) {
    body.set('add_to_cart_enhanced', '1');
    return fetch('/comprar/', { method: 'POST', body: body, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d || !d.success) throw new Error('No se pudo agregar el producto al carrito'); return d; });
  }

  function failed(btn, msg, label) {
    return function (e) {
      btn.disabled = false; btn.textContent = label;
      msg.classList.add('err'); msg.textContent = e.message || 'No se pudo aplicar la oferta';
    };
  }

  function accept(offer, btn, msg) {
    var id = cartId();
    if (!offer || !id) return;
    btn.disabled = true; btn.textContent = 'Agregando…'; msg.textContent = ''; msg.classList.remove('err');
    acceptAndAdd(offer, id, offer.triggerLineId).catch(failed(btn, msg, 'Agregar con descuento'));
  }

  // Página de producto: agrega el producto que se está viendo (con el formulario del tema: variante y
  // cantidad elegidas) y después acepta la oferta sobre esa línea del carrito.
  function acceptWithProduct(offer, btn, msg) {
    var form = productForm();
    if (!offer || !form) return;
    btn.disabled = true; btn.textContent = 'Agregando…'; msg.textContent = ''; msg.classList.remove('err');
    addToCart(new URLSearchParams(new FormData(form)))
      .then(function (d) {
        var line = d.item && d.item.id, id = (d.cart && d.cart.id) || (d.item && d.item.cart_id) || (LS.cart && LS.cart.id);
        if (!line || !id) { window.location.href = '/comprar/'; return null; }
        return acceptAndAdd(offer, String(id), String(line));
      })
      .catch(failed(btn, msg, 'Agregar los dos con descuento'));
  }

  function acceptAndAdd(offer, id, triggerLineId) {
    // 1) Registrar la aceptación (el servidor valida contra el carrito confirmado por TN).
    return fetch(API + 'accept', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ store: STORE, cartId: id, triggerLineId: String(triggerLineId), accessoryVariant: String(offer.variantId) }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'No se pudo aplicar la oferta'); return d; }); })
      // Sin Redis, TN tarda unos segundos en usar la URL nueva del callback: si el accesorio entra
      // antes, el descuento recién aparece en el próximo cambio. Con Redis la URL no cambia.
      .then(function (d) { return d.mode === 'redis' ? null : new Promise(function (resolve) { setTimeout(resolve, 4000); }); })
      .then(function () {
        // 2) Agregar el accesorio al carrito de Tiendanube, con el mismo pedido que usa el tema.
        var form = new URLSearchParams();
        form.append('add_to_cart', String(offer.productId));
        form.append('quantity', '1');
        (offer.values || []).forEach(function (v, i) { if (v) form.append('variation[' + i + ']', v); });
        return addToCart(form);
      })
      .then(function () {
        rememberAccepted(offer, id, triggerLineId);
        // 3) El carrito muestra el descuento recalculado por Tiendanube.
        window.location.href = '/comprar/';
      });
  }

  // Aceptaciones de esta sesión: el tema muestra el descuento sólo en los totales, no en cada producto.
  function readAccepted() {
    try { var list = JSON.parse(store.get('cte-accepted') || '[]'); return Array.isArray(list) ? list : []; } catch (e) { return []; }
  }
  function rememberAccepted(offer, id, triggerLineId) {
    var list = readAccepted().filter(function (a) { return !(a.cartId === String(id) && a.variantId === String(offer.variantId)); });
    list.push({ cartId: String(id), variantId: String(offer.variantId), name: offer.name, savings: offer.savings,
      pct: Number(offer.pct) || 0, triggerLineId: String(triggerLineId) });
    store.set('cte-accepted', JSON.stringify(list.slice(-10)));
  }
  function acceptedInCart() {
    var id = cartId(), inCart = {};
    cartItems().forEach(function (i) { inCart[String(i.variant_id || i.id)] = true; });
    return readAccepted().filter(function (a) { return a.cartId === id && inCart[a.variantId]; });
  }
  // Monto que muestra Tiendanube en el renglón «Completá tu equipo» de los totales, si está.
  function appliedAmount() {
    var squash = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); };
    var amount = function (t) { var m = squash(t).match(/-\s*\$\s*[\d.,]+/); return m ? m[0].replace(/\s+/g, '') : ''; };
    // Renglón de promociones del tema (Amazonas y Morelia).
    var rows = document.querySelectorAll('.js-total-promotions-detail-row');
    for (var r = 0; r < rows.length; r++) if (squash(rows[r].textContent).indexOf('Completá tu equipo') >= 0 && amount(rows[r].textContent)) return amount(rows[r].textContent);
    // Otros temas: el elemento más chico que lo menciona, sin contar espacios.
    var nodes = document.querySelectorAll('body *');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest('.cte-inline, .cte-overlay') || el.children.length > 3) continue;
      var text = squash(el.textContent);
      if (text.length > 120 || text.indexOf('Completá tu equipo') < 0) continue;
      var found = amount(el.parentNode ? el.parentNode.textContent : text);
      if (found) return found;
    }
    return '';
  }
  function appliedNotice() {
    var accepted = acceptedInCart();
    if (!accepted.length) return '';
    var amount = appliedAmount();
    var total = accepted.reduce(function (sum, a) { return sum + (Number(a.savings) || 0); }, 0);
    var names = accepted.map(function (a) { return esc(a.name); }).join(', ');
    return '<div class="cte-applied" role="status"><b>✓ Descuento especial aplicado: ' + (amount || ('-' + money(total))) + '</b>' +
      '<span>En ' + names + '. Lo ves en el renglón «Completá tu equipo» del total.</span></div>';
  }

  // Renglón del accesorio en la página del carrito: precio tachado y precio con descuento.
  // Sólo visual y sólo si Tiendanube ya muestra su renglón «Completá tu equipo» en los totales;
  // lo que se cobra lo calcula Tiendanube. El descuento cubre tantas unidades como principales.
  var decorating = false, cartObserver = null, cartForm = null;
  function lineQuantity(row, fallback) {
    var input = row && row.querySelector('.js-cart-quantity-input');
    var n = input ? parseInt(input.value, 10) : NaN;
    return isNaN(n) ? (fallback || 0) : n;
  }
  function cartRow(itemId) { return document.querySelector('.js-cart-item[data-item-id="' + itemId + '"]'); }
  function restoreCell(el) {
    if (el && el.hasAttribute('data-cte-orig')) { el.innerHTML = el.getAttribute('data-cte-orig'); el.removeAttribute('data-cte-orig'); }
  }
  function setCell(el, html) {
    if (!el) return;
    if (!el.hasAttribute('data-cte-orig')) el.setAttribute('data-cte-orig', el.innerHTML);
    el.innerHTML = html;
  }
  function decorateLines() {
    if (decorating || !/^\/comprar\/?$/.test(location.pathname)) return;
    decorating = true;
    // Sin observar mientras se modifican los precios: si no, el script reaccionaría a sus propios cambios.
    if (cartObserver) cartObserver.disconnect();
    try {
      var applied = appliedAmount(), confirmed = Boolean(applied), items = cartItems(), done = {};
      // El aviso sigue al renglón de Tiendanube: desaparece si deja de aplicar y toma su monto.
      var notice = document.querySelector('.cte-applied');
      if (notice && !confirmed) notice.parentNode.removeChild(notice);
      else if (notice) { var strong = notice.querySelector('b'); if (strong) strong.textContent = '✓ Descuento especial aplicado: ' + applied; }
      if (confirmed) acceptedInCart().forEach(function (a) {
        var item = items.filter(function (i) { return String(i.variant_id || i.id) === a.variantId; })[0];
        var row = item && cartRow(item.item_id), trigger = cartRow(a.triggerLineId);
        if (!row || !trigger || !(a.pct > 0)) return;
        var qty = lineQuantity(row, item.quantity), covered = Math.min(qty, lineQuantity(trigger, 1));
        if (!(qty > 0) || !(covered > 0)) return;
        var unit = item.unit_price / 100, full = unit * qty;
        var discount = Math.round(unit * covered * a.pct) / 100;
        var badge = '<span class="cte-line-badge">Descuento especial -' + a.pct + '%</span>';
        if (nativeLine(row, { unit: unit, full: full, discount: discount, pct: a.pct, allCovered: covered === qty })) { done[item.item_id] = true; return; }
        var unitEl = row.querySelector('.js-cart-item-unit-price');
        setCell(unitEl, covered === qty
          ? '<s class="cte-strike">' + money(unit) + '</s> <span class="cte-final">' + money(unit - unit * a.pct / 100) + '</span>' + badge
          : (unitEl && (unitEl.getAttribute('data-cte-orig') || unitEl.innerHTML)) + badge);
        setCell(row.querySelector('.js-cart-item-subtotal'),
          '<s class="cte-strike">' + money(full) + '</s> <span class="cte-final">' + money(full - discount) + '</span>');
        done[item.item_id] = true;
      });
      // Si el descuento dejó de aplicar (se quitó el principal), volver a los precios del tema.
      Array.prototype.forEach.call(document.querySelectorAll('.js-cart-item'), function (row) {
        if (done[row.getAttribute('data-item-id')]) return;
        restoreNative(row);
        restoreCell(row.querySelector('.js-cart-item-unit-price'));
        restoreCell(row.querySelector('.js-cart-item-subtotal'));
      });
    } finally {
      decorating = false;
      if (cartObserver && cartForm) cartObserver.observe(cartForm, { childList: true, subtree: true, characterData: true });
    }
  }
  // Temas con precio tachado nativo (Amazonas): mostrar el descuento con sus propios elementos.
  function showCompare(container, percent, compareText) {
    if (!container) return false;
    if (!container.hasAttribute('data-cte-style')) container.setAttribute('data-cte-style', container.getAttribute('style') || '');
    container.style.display = '';
    var pctEl = container.querySelector('.text-accent'), cmp = container.querySelector('.price-compare');
    if (pctEl) pctEl.textContent = '-' + percent + '%';
    if (cmp) cmp.textContent = compareText;
    return true;
  }
  function setText(el, text) {
    if (!el) return;
    if (!el.hasAttribute('data-cte-text')) el.setAttribute('data-cte-text', el.textContent);
    el.textContent = text;
  }
  function nativeLine(row, d) {
    var unitBox = row.querySelector('.js-cart-item-unit-price-compare-price-container');
    var subBox = row.querySelector('.js-cart-item-subtotal-compare-price-container');
    if (!unitBox && !subBox) return false;
    if (d.allCovered) {
      showCompare(unitBox, d.pct, money(d.unit));
      setText(row.querySelector('.js-cart-item-unit-price'), money(d.unit - d.unit * d.pct / 100));
    }
    showCompare(subBox, Math.round(d.discount / d.full * 1000) / 10, money(d.full));
    setText(row.querySelector('.js-cart-item-subtotal'), money(d.full - d.discount));
    var label = row.querySelector('.js-cart-item-promotion-label');
    if (label) {
      if (!label.hasAttribute('data-cte-style')) label.setAttribute('data-cte-style', label.getAttribute('style') || '');
      label.style.cssText = '';
      setText(label, 'Descuento especial -' + d.pct + '%');
    }
    return true;
  }
  function restoreNative(row) {
    Array.prototype.forEach.call(row.querySelectorAll('[data-cte-style]'), function (el) {
      el.setAttribute('style', el.getAttribute('data-cte-style')); el.removeAttribute('data-cte-style');
    });
    Array.prototype.forEach.call(row.querySelectorAll('[data-cte-text]'), function (el) {
      el.textContent = el.getAttribute('data-cte-text'); el.removeAttribute('data-cte-text');
    });
  }

  // El tema reescribe precios y totales al cambiar cantidades: volver a aplicar después.
  var linesTimer = null;
  function watchCart() {
    var form = document.querySelector('form.cart-body') || document.querySelector('form[action$="/comprar/"]');
    if (!form || !window.MutationObserver || !/^\/comprar\/?$/.test(location.pathname)) return;
    cartForm = form;
    cartObserver = new MutationObserver(function () {
      if (decorating) return;
      clearTimeout(linesTimer);
      linesTimer = setTimeout(decorateLines, 600);
    });
    cartObserver.observe(form, { childList: true, subtree: true, characterData: true });
  }

  function closeModal() {
    var el = document.querySelector('.cte-overlay');
    if (el) el.parentNode.removeChild(el);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') closeModal(); }

  function showModal(offers) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'cte-overlay';
    overlay.innerHTML = '<div class="cte-modal" role="dialog" aria-modal="true" aria-labelledby="cte-title">' +
      '<div class="cte-head"><div><h2 class="cte-title" id="cte-title">Completá tu equipo</h2>' +
      '<p class="cte-sub">Accesorios compatibles con descuento si los sumás ahora.</p></div>' +
      '<button type="button" class="cte-close" aria-label="Cerrar">×</button></div>' +
      '<div class="cte-list">' + offers.map(function (o) { return card(o); }).join('') + '</div></div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    overlay.querySelector('.cte-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    bind(overlay, offers);
    reportSeen('modal', offers);
    var first = overlay.querySelector('.cte-btn');
    if (first) first.focus();
  }

  // Carrito lateral (Morelia) o, si el tema no lo tiene (Amazonas), la página del carrito antes de los totales.
  function inlineTarget() {
    var panel = document.querySelector('.js-ajax-cart-panel');
    if (panel) return { parent: panel, before: panel.firstChild };
    if (!/^\/comprar\/?$/.test(location.pathname)) return null;
    var form = document.querySelector('form.cart-body') || document.querySelector('form[action$="/comprar/"]');
    if (!form) return null;
    var totals = form.querySelector('.js-cart-subtotal');
    var before = totals;
    while (before && before.parentNode !== form) before = before.parentNode;
    return { parent: form, before: before || null };
  }

  function renderInline(offers) {
    var target = inlineTarget();
    // En la página del carrito (Amazonas) se usa el renglón del tema; en el carrito lateral, las tarjetas.
    var native = Boolean(target && target.parent.tagName === 'FORM');
    // No tocar el bloque de la página de producto, que también usa .cte-inline.
    var old = document.querySelector('.cte-inline:not(.cte-product)');
    if (old) old.parentNode.removeChild(old);
    var notice = target ? appliedNotice() : '';
    if (!target || (!offers.length && !notice)) return;
    var box = document.createElement('section');
    box.className = 'cte-inline';
    box.setAttribute('aria-label', 'Agregá estos productos con descuento especial');
    if (native) box.className = 'cte-inline cte-native';
    box.innerHTML = notice + (offers.length ? (native
      ? '<h5 class="cte-native-title h4-md font-weight-normal mb-3">Agregá estos productos con descuento especial</h5><div class="cte-native-list">' +
        offers.map(nativeRow).join('') + '</div>'
      : '<h3 class="cte-title">Agregá estos productos con descuento especial</h3><div class="cte-list">' +
        offers.map(function (o) { return card(o); }).join('') + '</div>') : '');
    target.parent.insertBefore(box, target.before);
    bind(box, offers);
    if (offers.length) reportSeen('cart', offers);
  }

  // Página de producto: ofertas para el producto que se está viendo, debajo del botón de compra.
  function productForm() { return window.LS && LS.product ? document.querySelector('form.js-product-form') : null; }
  function productVariant(form) {
    var input = form.querySelector('[name="variant_id"]');
    if (input && input.value) return String(input.value);
    var variants = LS.variants || [];
    return variants.length === 1 ? String(variants[0].product_variant_id || variants[0].id) : '';
  }
  var productPending = null;
  function renderProduct() {
    var form = productForm();
    if (!form) return;
    clearTimeout(productPending);
    productPending = setTimeout(function () {
      var variant = productVariant(form);
      var old = document.querySelector('.cte-product');
      if (!variant) { if (old) old.parentNode.removeChild(old); return; }
      // Línea 0: el producto todavía no está en el carrito; sólo decide qué se muestra.
      var draw = function (offers) {
        var prev = document.querySelector('.cte-product');
        if (prev) prev.parentNode.removeChild(prev);
        if (!offers.length) return;
        var box = document.createElement('section');
        box.className = 'cte-inline cte-product';
        box.setAttribute('aria-label', 'Completá tu equipo');
        box.innerHTML = '<h3 class="cte-title">Completá tu equipo</h3><p class="cte-sub">Llevalo junto con este producto y ahorrá.</p>' +
          '<div class="cte-list">' + offers.map(function (o) { return card(o, 'Agregar los dos con descuento'); }).join('') + '</div>';
        form.parentNode.insertBefore(box, form.nextSibling);
        bind(box, offers, acceptWithProduct);
        reportSeen('product', offers);
      };
      requestOffers(variant + ':0:1', draw).then(draw);
    }, productPending === null ? 0 : 200);
  }

  var pending = null;
  function refresh(openModal) {
    clearTimeout(pending);
    pending = setTimeout(function () {
      var shown = false;
      fetchOffers(function (cached) {
        // Copia de esta sesión: dibujar ya; la respuesta nueva la reemplaza.
        renderInline(cached); decorateLines();
        if (openModal && cached.length) { showModal(cached); shown = true; }
      }).then(function (offers) {
        renderInline(offers);
        decorateLines();
        if (openModal && offers.length && !shown) showModal(offers);
      });
    }, openModal ? 50 : 0);
  }

  if (typeof LS.on === 'function') LS.on('productAddedToCart', function () { refresh(true); });
  else document.addEventListener('productAddedToCart', function () { refresh(true); });
  refresh(false);
  renderProduct();
  watchCart();
  var pForm = productForm();
  if (pForm) pForm.addEventListener('change', renderProduct);
})();
