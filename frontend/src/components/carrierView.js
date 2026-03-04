/* Carrier View Component - Shipments grouped by carrier/transport */

import { api, toast, state } from '../main.js';

export async function renderCarriers() {
  const section = document.getElementById('section-carriers');
  section.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">🚚 Transportistas</h1>
      <p class="section-subtitle">Envíos agrupados por transportista y método de envío</p>
    </div>
    <div class="spinner"></div>
  `;

  try {
    const batchParam = state.currentBatchId ? `?batch_id=${state.currentBatchId}` : '';
    const shipments = await api(`/shipments${batchParam}`);

    if (!shipments.length) {
      section.innerHTML = `
        <div class="section-header">
          <h1 class="section-title">🚚 Transportistas</h1>
          <p class="section-subtitle">Envíos agrupados por transportista y método de envío</p>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">🚚</div>
          <p class="empty-state-text">No hay envíos cargados.</p>
        </div>
      `;
      return;
    }

    // Group by carrier
    const groups = {};

    shipments.forEach(s => {
      let groupKey, groupLabel, groupColor;

      if (s.shipping_method === 'flex') {
        groupKey = s.assigned_carrier || 'flex-sin-asignar';
        groupLabel = s.assigned_carrier || '⚠️ Flex Sin Asignar';
        groupColor = s.assigned_carrier ? '#6366f1' : '#ef4444';
      } else {
        groupKey = `colecta-${s.carrier_name || 'desconocido'}`;
        groupLabel = `📦 ${s.carrier_name || 'Colecta'}`;
        groupColor = '#f59e0b';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { label: groupLabel, color: groupColor, shipments: [] };
      }
      groups[groupKey].shipments.push(s);
    });

    // Summary stats
    const flexCount = shipments.filter(s => s.shipping_method === 'flex').length;
    const colectaCount = shipments.filter(s => s.shipping_method === 'colecta').length;
    const unassignedFlex = shipments.filter(s => s.shipping_method === 'flex' && !s.assigned_carrier).length;

    section.innerHTML = `
      <div class="section-header">
        <h1 class="section-title">🚚 Transportistas</h1>
        <p class="section-subtitle">Envíos agrupados por transportista y método de envío</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card card accent">
          <div class="stat-value">${shipments.length}</div>
          <div class="stat-label">Total Envíos</div>
        </div>
        <div class="stat-card card info">
          <div class="stat-value">${flexCount}</div>
          <div class="stat-label">Flex</div>
        </div>
        <div class="stat-card card warning">
          <div class="stat-value">${colectaCount}</div>
          <div class="stat-label">Colecta</div>
        </div>
        ${unassignedFlex > 0 ? `
          <div class="stat-card card danger">
            <div class="stat-value">${unassignedFlex}</div>
            <div class="stat-label">Flex Sin Asignar</div>
          </div>
        ` : ''}
      </div>

      <div class="carrier-grid" id="carrier-grid"></div>
    `;

    const grid = document.getElementById('carrier-grid');

    // Sort: assigned carriers first, unassigned last
    const sortedGroups = Object.entries(groups).sort((a, b) => {
      if (a[0].includes('sin-asignar')) return 1;
      if (b[0].includes('sin-asignar')) return -1;
      return b[1].shipments.length - a[1].shipments.length;
    });

    for (const [key, group] of sortedGroups) {
      const col = document.createElement('div');
      col.className = 'carrier-column card';
      col.innerHTML = `
        <div class="carrier-header" style="background: ${group.color}20; border-bottom: 2px solid ${group.color};">
          <span style="color: ${group.color}">${group.label}</span>
          <span class="carrier-count" style="background: ${group.color}30; color: ${group.color}">
            ${group.shipments.length}
          </span>
        </div>
        <div class="carrier-shipments">
          ${group.shipments.map(s => `
            <div class="carrier-shipment-item">
              <div class="product">${s.product_name}</div>
              <div class="destination">
                📍 ${s.city || 'N/A'}, ${s.province || 'N/A'} · CP ${s.postal_code || 'N/A'}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                <span style="color:var(--text-muted);font-size:12px;">
                  👤 ${s.recipient_name || 'N/A'}
                </span>
                <select class="status-select" data-id="${s.id}" onchange="window.__updateStatus(${s.id}, this.value)">
                  <option value="pendiente" ${s.status === 'pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                  <option value="encontrado" ${s.status === 'encontrado' ? 'selected' : ''}>🔍 Encontrado</option>
                  <option value="empaquetado" ${s.status === 'empaquetado' ? 'selected' : ''}>📦 Empaquetado</option>
                  <option value="despachado" ${s.status === 'despachado' ? 'selected' : ''}>✅ Despachado</option>
                </select>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      grid.appendChild(col);
    }

    // Status update handler
    window.__updateStatus = async (id, status) => {
      try {
        await fetch(`/api/shipments/${id}/status?status=${status}`, { method: 'PATCH' });
        toast(`Envío #${id} → ${status}`, 'success');
      } catch (err) {
        toast('Error actualizando estado', 'error');
      }
    };

  } catch (err) {
    section.innerHTML += `<p style="color:var(--danger);">Error: ${err.message}</p>`;
  }
}
