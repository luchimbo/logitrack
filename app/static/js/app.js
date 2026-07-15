const state = {
  searches: [],
  alerts: [],
  previewProperties: [],
  lastPreviewPayload: null,
  selectedMore: {},
  selectedLocation: null,
  locationSuggestions: [],
  highlightedLocationIndex: -1,
  locationTimer: null,
  resultFilter: "all",
  runningSearches: {},
};

const labels = {
  venta: "Comprar",
  alquiler: "Alquilar",
  temporal: "Temporal",
  emprendimientos: "Emprendimientos",
  departamentos: "Departamento",
  casas: "Casa",
  ph: "PH",
  terrenos: "Terreno",
  "locales-comerciales": "Local comercial",
  "oficinas-comerciales": "Oficina",
};

const els = {
  location: document.querySelector("#location-input"),
  locationSuggestions: document.querySelector("#location-suggestions"),
  locationSuggestionList: document.querySelector("#location-suggestion-list"),
  status: document.querySelector("#status-line"),
  searchNow: document.querySelector("#search-now"),
  saveTop: document.querySelector("#save-current-search"),
  saveInline: document.querySelector("#save-current-search-inline"),
  exportCurrent: document.querySelector("#export-current-results"),
  quickFilters: document.querySelector("#quick-filters"),
  advanced: document.querySelector("#advanced-filters"),
  toggleAdvanced: document.querySelector("#toggle-advanced"),
  searches: document.querySelector("#searches"),
  alerts: document.querySelector("#alerts"),
  properties: document.querySelector("#properties"),
  resultSummary: document.querySelector("#result-summary"),
  searchCount: document.querySelector("#search-count"),
  alertCount: document.querySelector("#alert-count"),
  leads: document.querySelector("#leads-list"),
  leadsSummary: document.querySelector("#leads-summary"),
  refreshLeads: document.querySelector("#refresh-leads"),
};

async function init() {
  bindPopovers();
  bindControls();
  await Promise.all([loadLocationSuggestions(""), refreshSideData()]);
  updateLabels();
  renderProperties([]);
}

function bindPopovers() {
  document.querySelectorAll("[data-popover-target]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => togglePopover(button));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".filter-group")) closePopovers();
    if (!event.target.closest(".location-box")) closeLocationSuggestions();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopovers();
      closeLocationSuggestions();
    }
  });
}

function bindControls() {
  els.searchNow.addEventListener("click", runPreview);
  els.saveTop.addEventListener("click", saveCurrentSearch);
  els.saveInline.addEventListener("click", saveCurrentSearch);
  els.exportCurrent.addEventListener("click", exportCurrentResults);
  els.refreshLeads.addEventListener("click", loadLeads);
  els.toggleAdvanced.addEventListener("click", toggleAdvancedFilters);
  els.location.addEventListener("focus", () => openLocationSuggestions());
  els.location.addEventListener("input", handleLocationInput);
  els.location.addEventListener("keydown", handleLocationKeydown);

  document.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("change", updateLabels);
  });
  document.querySelectorAll("[data-apply]").forEach((button) => {
    button.addEventListener("click", () => {
      closePopovers();
      runPreview();
    });
  });
  document.querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      clearGroup(button.dataset.clear);
      updateLabels();
      closePopovers();
    });
  });
  document.querySelectorAll(".segmented").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      group.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.selectedMore[group.dataset.field] = Number(button.dataset.value);
      updateLabels();
    });
  });
  document.querySelectorAll("[data-result-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.resultFilter = button.dataset.resultFilter;
      document.querySelectorAll("[data-result-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderProperties(state.previewProperties);
    });
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget));
  });
}

function switchView(viewId) {
  document.querySelectorAll(".app-view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  document.querySelectorAll("[data-view-target]").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === viewId));
  if (viewId === "monitor-view") refreshSideData();
  if (viewId === "leads-view") loadLeads();
}

function togglePopover(button) {
  const target = document.querySelector(`#${button.dataset.popoverTarget}`);
  const isOpen = target.classList.contains("open");
  closePopovers();
  closeLocationSuggestions();
  if (!isOpen) {
    target.classList.add("open");
    button.setAttribute("aria-expanded", "true");
  }
}

function closePopovers() {
  document.querySelectorAll(".filter-popover.open").forEach((popover) => popover.classList.remove("open"));
  document.querySelectorAll("[data-popover-target]").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function toggleAdvancedFilters() {
  const shouldOpen = els.advanced.hidden;
  els.advanced.hidden = !shouldOpen;
  els.toggleAdvanced.setAttribute("aria-expanded", String(shouldOpen));
  closePopovers();
}

function handleLocationInput() {
  const currentValue = els.location.value.trim();
  if (!state.selectedLocation || state.selectedLocation.display !== currentValue) {
    state.selectedLocation = null;
  }
  window.clearTimeout(state.locationTimer);
  state.locationTimer = window.setTimeout(() => loadLocationSuggestions(currentValue), 200);
  updateStatus();
}

function handleLocationKeydown(event) {
  if (event.key === "Enter") {
    if (!els.locationSuggestions.hidden && state.highlightedLocationIndex >= 0) {
      event.preventDefault();
      selectLocation(state.locationSuggestions[state.highlightedLocationIndex]);
      return;
    }
    runPreview();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    openLocationSuggestions();
    moveLocationHighlight(1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveLocationHighlight(-1);
  }
}

async function loadLocationSuggestions(query) {
  const params = new URLSearchParams({ limit: "8" });
  if (query) params.set("q", query);
  const response = await fetchJson(`/api/locations?${params.toString()}`);
  state.locationSuggestions = response.items || [];
  state.highlightedLocationIndex = state.locationSuggestions.length ? 0 : -1;
  renderLocationSuggestions();
  if (document.activeElement === els.location) openLocationSuggestions();
}

function renderLocationSuggestions() {
  if (!state.locationSuggestions.length) {
    els.locationSuggestionList.innerHTML = `<div class="suggestion-empty">No encontramos ubicaciones. Podés buscar igual con el texto escrito.</div>`;
    return;
  }
  els.locationSuggestionList.innerHTML = state.locationSuggestions.map((location, index) => {
    const active = index === state.highlightedLocationIndex ? " active" : "";
    return `<button class="suggestion-item${active}" type="button" role="option" aria-selected="${index === state.highlightedLocationIndex}" data-location-index="${index}">
      <strong>${escapeHtml(location.label)}</strong><span>, ${escapeHtml(location.secondary)}</span>
    </button>`;
  }).join("");
  els.locationSuggestionList.querySelectorAll("[data-location-index]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => selectLocation(state.locationSuggestions[Number(button.dataset.locationIndex)]));
  });
}

function openLocationSuggestions() {
  closePopovers();
  els.locationSuggestions.hidden = false;
  els.location.setAttribute("aria-expanded", "true");
  renderLocationSuggestions();
}

function closeLocationSuggestions() {
  els.locationSuggestions.hidden = true;
  els.location.setAttribute("aria-expanded", "false");
}

function moveLocationHighlight(direction) {
  if (!state.locationSuggestions.length) return;
  const next = state.highlightedLocationIndex + direction;
  state.highlightedLocationIndex = (next + state.locationSuggestions.length) % state.locationSuggestions.length;
  renderLocationSuggestions();
}

function selectLocation(location) {
  state.selectedLocation = location;
  els.location.value = location.display;
  closeLocationSuggestions();
  updateStatus();
}

async function refreshSideData() {
  const [searches, alerts] = await Promise.all([fetchJson("/api/searches"), fetchJson("/api/alerts")]);
  state.searches = searches;
  state.alerts = alerts;
  renderSideData();
}

async function loadLeads() {
  els.leadsSummary.textContent = "Cargando leads con contacto...";
  const leads = await fetchJson("/api/properties?with_phone=true");
  els.leadsSummary.textContent = leads.length
    ? `${leads.length} propiedades con contacto detectado`
    : "Todavía no hay propiedades con contacto. Guardá y ejecutá búsquedas para ir juntando leads.";
  els.leads.innerHTML = leads.length
    ? leads.map(renderProperty).join("")
    : `<div class="property-card"><div class="property-body"><strong class="property-title">Sin leads todavía</strong><p class="muted">Cuando detectemos teléfonos o WhatsApps, van a aparecer acá.</p></div></div>`;
}

async function runPreview() {
  const payload = buildPreviewPayload();
  state.lastPreviewPayload = payload;
  els.searchNow.disabled = true;
  els.searchNow.textContent = "Buscando...";
  els.status.textContent = "Buscando publicaciones...";

  try {
    const response = await fetch("/api/search/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    state.previewProperties = body.properties || [];
    state.resultFilter = "all";
    document.querySelectorAll("[data-result-filter]").forEach((item) => item.classList.toggle("active", item.dataset.resultFilter === "all"));
    renderProperties(state.previewProperties);
    showSaveButtons(true);
    const unsupported = (body.unsupported_filters || []).length ? ` Filtros no aplicados: ${body.unsupported_filters.join(", ")}.` : "";
    els.status.textContent = body.status === "success"
      ? `Resultados listos.${unsupported}`
      : body.status === "partial"
        ? `Resultados parciales. ${body.message || ""}${unsupported}`
        : `No se pudo completar la búsqueda. ${body.message || ""}${unsupported}`;
  } catch (error) {
    els.status.textContent = `No se pudo ejecutar la búsqueda. ${error.message}`;
  } finally {
    els.searchNow.disabled = false;
    els.searchNow.textContent = "Buscar";
  }
}

async function saveCurrentSearch() {
  if (!state.lastPreviewPayload) return;
  const filters = state.lastPreviewPayload.filters;
  const payload = {
    name: `Búsqueda ${filters.location_display || filters.location || "capital-federal"}`,
    mode: "filters",
    portal: state.lastPreviewPayload.portal,
    filters,
    schedule_hours: 12,
    active: true,
  };
  const response = await fetch("/api/searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (response.ok) {
    els.status.textContent = "Búsqueda guardada para monitoreo cada 12 horas.";
    showSaveButtons(false);
    await refreshSideData();
  } else {
    const body = await response.json();
    els.status.textContent = body.detail || "No se pudo guardar la búsqueda.";
  }
}

function exportCurrentResults() {
  const rows = filteredProperties(state.previewProperties);
  const headers = ["portal", "titulo", "precio", "moneda", "ubicacion", "direccion", "ambientes", "dormitorios", "m2_cubiertos", "m2_totales", "inmobiliaria", "telefono", "whatsapp", "estado_contacto", "url"];
  const csv = [headers, ...rows.map((property) => [
    property.source,
    property.title,
    property.price,
    property.currency,
    property.location_label,
    property.address,
    property.rooms,
    property.bedrooms,
    property.covered_m2,
    property.total_m2,
    property.real_estate,
    property.phone,
    property.whatsapp_url || whatsappUrlFromPhone(property.phone),
    property.contact_status,
    property.url,
  ])].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadText(`propiedades-preview-${Date.now()}.csv`, csv);
}

function buildPreviewPayload() {
  const useAdvanced = !els.advanced.hidden;
  const selectedTypes = useAdvanced ? checkedValues("property_type") : [];
  const primaryType = selectedTypes[0] || null;
  const surfaceType = useAdvanced ? radioValue("surface_type") : null;
  const surfaceMin = useAdvanced ? numberValue("#surface-min") : null;
  const surfaceMax = useAdvanced ? numberValue("#surface-max") : null;
  const locationText = els.location.value.trim();
  const locationPayload = state.selectedLocation
    ? {
        location: state.selectedLocation.portal_slugs?.zonaprop || state.selectedLocation.id,
        location_id: state.selectedLocation.id,
        location_display: state.selectedLocation.display,
        portal_slugs: state.selectedLocation.portal_slugs || {},
      }
    : {
        location: locationText || "capital-federal",
        location_id: null,
        location_display: locationText || null,
        portal_slugs: {},
      };

  return {
    portal: null,
    filters: {
      operation: useAdvanced ? radioValue("operation") : "venta",
      property_type: primaryType,
      ...locationPayload,
      price_min: useAdvanced ? numberValue("#price-min") : null,
      price_max: useAdvanced ? numberValue("#price-max") : null,
      currency: useAdvanced ? radioValue("currency") : null,
      total_m2_min: useAdvanced && surfaceType === "total" ? surfaceMin : null,
      total_m2_max: useAdvanced && surfaceType === "total" ? surfaceMax : null,
      covered_m2_min: useAdvanced && surfaceType === "covered" ? surfaceMin : null,
      covered_m2_max: useAdvanced && surfaceType === "covered" ? surfaceMax : null,
      rooms_min: useAdvanced ? numberValue("#rooms-min") : null,
      bedrooms_min: useAdvanced ? numberValue("#bedrooms-min") : null,
      bathrooms_min: useAdvanced ? state.selectedMore.bathrooms_min || null : null,
      parking_min: useAdvanced ? state.selectedMore.parking_min ?? null : null,
      age_max: useAdvanced && radioValue("age") === "5" ? 5 : null,
      expenses_max: null,
      extras: useAdvanced ? collectExtras(selectedTypes, surfaceType) : {},
    },
  };
}

function collectExtras(selectedTypes, surfaceType) {
  return {
    features: textValue("#features-input"),
    property_types: selectedTypes,
    bedrooms_max: numberValue("#bedrooms-max"),
    rooms_max: numberValue("#rooms-max"),
    surface_type: surfaceType,
    publisher: radioValue("publisher"),
    published: radioValue("published"),
    age: radioValue("age"),
    room_types: checkedValues("room_type"),
    property_features: checkedValues("property_feature"),
    services: checkedValues("service"),
    media: checkedValues("media"),
    address: textValue("#address-input"),
  };
}

function clearGroup(group) {
  if (group === "property") document.querySelectorAll("[name='property_type']").forEach((input) => { input.checked = false; });
  if (group === "rooms") ["#bedrooms-min", "#bedrooms-max", "#rooms-min", "#rooms-max"].forEach((selector) => { document.querySelector(selector).value = ""; });
  if (group === "price") {
    document.querySelector("[name='currency'][value='ARS']").checked = true;
    ["#price-min", "#price-max"].forEach((selector) => { document.querySelector(selector).value = ""; });
  }
  if (group === "more") {
    ["#features-input", "#surface-min", "#surface-max", "#address-input"].forEach((selector) => { document.querySelector(selector).value = ""; });
    document.querySelector("[name='surface_type'][value='covered']").checked = true;
    document.querySelector("[name='publisher'][value='all']").checked = true;
    document.querySelectorAll("#more-popover input[type='checkbox'], #more-popover input[name='published'], #more-popover input[name='age']").forEach((input) => { input.checked = false; });
    document.querySelectorAll(".segmented button").forEach((button) => button.classList.remove("active"));
    state.selectedMore = {};
  }
}

function updateLabels() {
  document.querySelector("#operation-label").textContent = labels[radioValue("operation")] || "Comprar";
  const types = checkedValues("property_type");
  document.querySelector("#property-label").textContent = types.length ? types.map((type) => labels[type] || type).join(", ") : "Propiedad";
  const bedroom = numberValue("#bedrooms-min");
  const room = numberValue("#rooms-min");
  const roomParts = [];
  if (bedroom) roomParts.push(`${bedroom} dormitorio${bedroom > 1 ? "s" : ""}`);
  if (room) roomParts.push(`${room} ambiente${room > 1 ? "s" : ""}`);
  document.querySelector("#rooms-label").textContent = roomParts.length ? roomParts.join(" | ") : "Dormitorios | Ambientes";
  const currency = radioValue("currency") === "USD" ? "USD" : "$";
  const price = numberValue("#price-max") || numberValue("#price-min");
  document.querySelector("#price-label").textContent = price ? `${currency}${formatCompact(price)}` : "Precio";
  updateStatus();
}

function updateStatus() {
  if (state.selectedLocation) {
    els.status.textContent = `Listo para buscar en ${state.selectedLocation.display}. Los filtros son opcionales.`;
    return;
  }
  els.status.textContent = els.location.value.trim()
    ? "Listo para buscar con el texto escrito. Si aparece una ubicación, conviene seleccionarla."
    : "Ingresá una ciudad o barrio para buscar. Los filtros son opcionales.";
}

function renderSideData() {
  els.searchCount.textContent = `${state.searches.length} guardadas`;
  els.alertCount.textContent = `${state.alerts.length} alertas`;
  els.searches.innerHTML = state.searches.length ? state.searches.map(renderSearch).join("") : `<div class="mini-card muted">No hay búsquedas guardadas.</div>`;
  els.alerts.innerHTML = state.alerts.length ? state.alerts.map(renderAlert).join("") : `<div class="mini-card muted">No hay alertas.</div>`;
  document.querySelectorAll("[data-run-search]").forEach((button) => {
    if (!button.parentElement.querySelector(`[data-run-deep-search="${button.dataset.runSearch}"]`)) {
      const deepButton = document.createElement("button");
      deepButton.type = "button";
      deepButton.dataset.runDeepSearch = button.dataset.runSearch;
      deepButton.textContent = "Profunda";
      button.insertAdjacentElement("afterend", deepButton);
    }
  });
  document.querySelectorAll("[data-run-search]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      await runSavedSearch(button.dataset.runSearch, "run");
      await refreshSideData();
    });
  });
  document.querySelectorAll("[data-run-deep-search]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      await runSavedSearch(button.dataset.runDeepSearch, "run-deep");
      await refreshSideData();
    });
  });
}

async function runSavedSearch(searchId, mode) {
  const label = mode === "run-deep" ? "Busqueda profunda" : "Busqueda";
  state.runningSearches[searchId] = `${label} en curso...`;
  els.status.textContent = state.runningSearches[searchId];
  try {
    if (mode === "run-deep") {
      await runDeepSearchWithProgress(searchId, label);
      return;
    }
    const response = await fetch(`/api/searches/${searchId}/${mode}`, { method: "POST" });
    const body = await response.json();
    state.runningSearches[searchId] = body.status === "success"
      ? `${label} lista: ${body.properties_seen || 0} vistas, ${body.properties_created || 0} nuevas.`
      : `${label} fallo: ${body.message || "error sin detalle"}`;
  } catch (error) {
    state.runningSearches[searchId] = `${label} fallo: ${error.message}`;
  }
  els.status.textContent = state.runningSearches[searchId];
}

async function runDeepSearchWithProgress(searchId, label) {
  const startResponse = await fetch(`/api/searches/${searchId}/run-deep/start`, { method: "POST" });
  const startBody = await startResponse.json();
  if (!startResponse.ok) {
    state.runningSearches[searchId] = `${label} fallo: ${startBody.detail || startBody.message || "error sin detalle"}`;
    els.status.textContent = state.runningSearches[searchId];
    return;
  }

  let body = startBody;
  while (body.status === "running") {
    state.runningSearches[searchId] = `${label}: ${body.properties_seen || 0} encontradas, ${body.properties_created || 0} nuevas, ${body.price_changes || 0} cambios.`;
    els.status.textContent = state.runningSearches[searchId];
    await sleep(1200);
    body = await fetchJson(`/api/search-runs/${startBody.id}`);
  }

  state.runningSearches[searchId] = body.status === "success"
    ? `${label} lista: ${body.properties_seen || 0} encontradas, ${body.properties_created || 0} nuevas.`
    : `${label} fallo: ${body.message || "error sin detalle"}`;
  els.status.textContent = state.runningSearches[searchId];
}

function renderSearch(search) {
  const location = search.filters?.location_display || search.filters?.location || "sin ubicación";
  const lastRun = search.last_run_at ? ` · última: ${new Date(search.last_run_at).toLocaleString("es-AR")}` : "";
  const stats = `${search.property_count || 0} propiedades · ${search.contact_count || 0} contactos`;
  return `<div class="mini-card"><strong>${escapeHtml(search.name)}</strong><span class="muted">${escapeHtml(location)} · ${search.portal || "multiportal"} · cada ${search.schedule_hours}h${lastRun}</span><span class="muted">${stats}</span><div class="mini-actions"><button type="button" data-run-search="${search.id}">Ejecutar</button><a href="/api/export/properties.csv?search_id=${search.id}">CSV</a></div></div>`;
}

function renderAlert(alert) {
  return `<div class="mini-card"><strong>${escapeHtml(alert.title)}</strong><span class="muted">${escapeHtml(alert.message || "")}</span></div>`;
}

function renderProperties(properties) {
  const filtered = filteredProperties(properties);
  els.quickFilters.hidden = !properties.length;
  els.exportCurrent.hidden = !properties.length;
  const total = properties.length;
  const shown = filtered.length;
  els.resultSummary.textContent = total
    ? `${shown} de ${total} publicaciones mostradas`
    : "Ingresá una ciudad o barrio para ver publicaciones.";
  els.properties.innerHTML = filtered.length
    ? filtered.map(renderProperty).join("")
    : `<div class="property-card"><div class="property-body"><strong class="property-title">Sin resultados para este filtro</strong><p class="muted">Probá otro filtro rápido o hacé una búsqueda nueva.</p></div></div>`;
}

function filteredProperties(properties) {
  if (state.resultFilter === "with_whatsapp") return properties.filter((property) => property.whatsapp_url || property.phone);
  if (state.resultFilter === "with_phone") return properties.filter((property) => property.phone);
  if (state.resultFilter === "with_photo") return properties.filter((property) => property.image_urls?.length);
  return properties;
}

function renderProperty(property) {
  const image = property.image_urls?.[0] || "https://placehold.co/640x380/f2f2f2/777?text=Sin+foto";
  const price = property.currency && property.price ? `${property.currency} ${Number(property.price).toLocaleString("es-AR")}` : "Precio a consultar";
  const whatsapp = property.whatsapp_url || whatsappUrlFromPhone(property.phone);
  const contact = whatsapp
    ? `<div class="contact-row"><a class="whatsapp-link" href="${escapeHtml(whatsapp)}" target="_blank" rel="noreferrer">WhatsApp ${escapeHtml(property.phone || "")}</a><span class="contact-status">${escapeHtml(contactLabel(property.contact_status))}</span></div>`
    : `<div class="contact-row"><span class="contact-status">${escapeHtml(contactLabel(property.contact_status))}</span></div>`;
  const meta = [
    property.rooms ? `${property.rooms} amb` : null,
    property.bedrooms ? `${property.bedrooms} dorm` : null,
    property.covered_m2 ? `${property.covered_m2} m² cub` : null,
    property.bathrooms ? `${property.bathrooms} baños` : null,
  ].filter(Boolean);
  return `<article class="property-card"><img src="${escapeHtml(image)}" alt=""><div class="property-body"><p class="property-price">${price}</p><strong class="property-title">${escapeHtml(property.title || "Publicación")}</strong><p class="muted">${escapeHtml(property.address || property.location_label || "")}</p><div class="property-meta">${meta.map((item) => `<span class="pill">${item}</span>`).join("")}</div>${contact}<p>${escapeHtml(short(property.description || "", 180))}</p><div class="property-footer"><span class="muted">${escapeHtml(property.real_estate || property.source)}</span><a href="${escapeHtml(property.url)}" target="_blank" rel="noreferrer">Ver publicación</a></div></div></article>`;
}

function showSaveButtons(show) {
  els.saveTop.hidden = !show;
  els.saveInline.hidden = !show;
}

function checkedValues(name) {
  return Array.from(document.querySelectorAll(`[name='${name}']:checked`)).map((input) => input.value);
}

function radioValue(name) {
  return document.querySelector(`[name='${name}']:checked`)?.value || null;
}

function numberValue(selector) {
  const value = document.querySelector(selector).value;
  return value === "" ? null : Number(value);
}

function textValue(selector) {
  return document.querySelector(selector).value.trim() || null;
}

function formatCompact(value) {
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return value.toLocaleString("es-AR");
}

function short(value, size = 60) {
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function normalizePhoneForWhatsApp(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("54")) return `+${digits}`;
  if (digits.startsWith("11") && digits.length === 10) return `+549${digits}`;
  return `+54${digits}`;
}

function whatsappUrlFromPhone(value) {
  const phone = normalizePhoneForWhatsApp(value);
  return phone ? `https://wa.me/${phone.replace("+", "")}` : null;
}

function contactLabel(status) {
  return {
    phone_found: "Teléfono detectado",
    whatsapp_found: "WhatsApp detectado",
    contact_hidden: "Contacto oculto",
    requires_form: "Requiere formulario",
    not_available: "Sin contacto visible",
  }[status] || "Sin contacto visible";
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

init();
