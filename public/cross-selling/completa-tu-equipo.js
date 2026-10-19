// «Completá tu equipo» · tiendas habilitadas en Logitrack (demo 7570182 y PC MIDI 78394).
// Lo carga el script registrado en Partners. No depende del JavaScript del tema.
(function () {
  'use strict';
  var STORES = ['7570182', '78394'];
  var API = 'https://www.geomodi.ai/api/cross-selling/storefront/';
  var STORE = window.LS && LS.store ? String(LS.store.id) : '';
  if (STORES.indexOf(STORE) < 0 || window.__completaTuEquipo) return;
  window.__completaTuEquipo = true;

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
    '.cte-inline .cte-title{font-size:16px}.cte-inline .cte-card{grid-template-columns:56px 1fr;padding:8px}.cte-inline .cte-img{width:56px;height:56px}',
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function fetchOffers() {
    var items = cartItems();
    if (!items.length) return Promise.resolve([]);
    return requestOffers(items.slice(0, 40).map(function (i) { return (i.variant_id || i.id) + ':' + i.item_id + ':' + (i.quantity || 1); }).join(','));
  }

  function requestOffers(q) {
    return fetch(API + 'offers?store=' + STORE + '&items=' + encodeURIComponent(q), { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : { offers: [] }; })
      .then(function (d) { return Array.isArray(d.offers) ? d.offers : []; })
      .catch(function () { return []; });
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
    Array.prototype.forEach.call(root.querySelectorAll('.cte-card'), function (el) {
      var offer = offers.filter(function (o) { return String(o.variantId) === el.getAttribute('data-variant'); })[0];
      var btn = el.querySelector('.cte-btn'), msg = el.querySelector('.cte-msg');
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
      msg.className = 'cte-msg err'; msg.textContent = e.message || 'No se pudo aplicar la oferta';
    };
  }

  function accept(offer, btn, msg) {
    var id = cartId();
    if (!offer || !id) return;
    btn.disabled = true; btn.textContent = 'Agregando…'; msg.textContent = ''; msg.className = 'cte-msg';
    acceptAndAdd(offer, id, offer.triggerLineId).catch(failed(btn, msg, 'Agregar con descuento'));
  }

  // Página de producto: agrega el producto que se está viendo (con el formulario del tema: variante y
  // cantidad elegidas) y después acepta la oferta sobre esa línea del carrito.
  function acceptWithProduct(offer, btn, msg) {
    var form = productForm();
    if (!offer || !form) return;
    btn.disabled = true; btn.textContent = 'Agregando…'; msg.textContent = ''; msg.className = 'cte-msg';
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
        store.set('cte-added', '1');
        // 3) El carrito muestra el descuento recalculado por Tiendanube.
        window.location.href = '/comprar/';
      });
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
    var old = document.querySelector('.cte-inline');
    if (old) old.parentNode.removeChild(old);
    if (!target || !offers.length) return;
    var box = document.createElement('section');
    box.className = 'cte-inline';
    box.setAttribute('aria-label', 'Agregá estos productos con descuento especial');
    box.innerHTML = '<h3 class="cte-title">Agregá estos productos con descuento especial</h3><div class="cte-list">' + offers.map(function (o) { return card(o); }).join('') + '</div>';
    target.parent.insertBefore(box, target.before);
    bind(box, offers);
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
      requestOffers(variant + ':0:1').then(function (offers) {
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
      });
    }, 300);
  }

  var pending = null;
  function refresh(openModal) {
    clearTimeout(pending);
    pending = setTimeout(function () {
      fetchOffers().then(function (offers) {
        renderInline(offers);
        if (openModal && offers.length) showModal(offers);
      });
    }, 400);
  }

  if (typeof LS.on === 'function') LS.on('productAddedToCart', function () { refresh(true); });
  else document.addEventListener('productAddedToCart', function () { refresh(true); });
  refresh(false);
  renderProduct();
  var pForm = productForm();
  if (pForm) pForm.addEventListener('change', renderProduct);
})();
