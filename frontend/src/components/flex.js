/* Flex Section - Picking list + carrier assignment for Flex shipments only */

import { api, toast, state } from '../main.js';

export async function renderFlex() {
  const section = document.getElementById('section-flex');
  section.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">🚀 Flex</h1>
      <p class="section-subtitle">Envíos por Mercado Envíos Flex (despacho propio)</p>
    </div>
    <div class="spinner"></div>
  `;

  try {
    const batchParam = state.currentBatchId ? `?batch_id=${state.currentBatchId}` : '';
    const sep = batchParam ? '&' : '?';
    const [pickingList, shipments] = await Promise.all([
      api(`/picking-list${batchParam}`),
      api(`/shipments${batchParam}${sep}shipping_method=flex`),
    ]);

    const flexPicking = pickingList.filter(p => p.shipping_method === 'flex');
    const totalPackages = shipments.length;
    const totalUnits = flexPicking.reduce((sum, p) => sum + p.total_quantity, 0);
    const completedProducts = flexPicking.filter(p => p.statuses.every(s => s !== 'pendiente')).length;

    // Group by assigned carrier
    const carrierGroups = {};
    shipments.forEach(s => {
      const c = s.assigned_carrier || 'Sin asignar';
      if (!carrierGroups[c]) carrierGroups[c] = [];
      carrierGroups[c].push(s);
    });

    flexPicking.sort((a, b) => {
      const aComplete = a.statuses.every(s => s !== 'pendiente');
      const bComplete = b.statuses.every(s => s !== 'pendiente');
      if (aComplete !== bComplete) return aComplete ? 1 : -1;
      return b.total_quantity - a.total_quantity;
    });

    section.innerHTML = `
      <div class="section-header flex-between">
        <div>
          <h1 class="section-title">🚀 Flex</h1>
          <p class="section-subtitle">Envíos por Mercado Envíos Flex (despacho propio)</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" id="btn-recalc-flex">🔄 Recalcular Zonas</button>
          <button class="btn btn-success btn-sm" id="btn-mark-all-flex">✓ Marcar todo encontrado</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card card accent">
          <div class="stat-value">${totalPackages}</div>
          <div class="stat-label">Paquetes Flex</div>
        </div>
        <div class="stat-card card info">
          <div class="stat-value">${flexPicking.length}</div>
          <div class="stat-label">Productos Distintos</div>
        </div>
        <div class="stat-card card warning">
          <div class="stat-value">${totalUnits}</div>
          <div class="stat-label">Unidades Total</div>
        </div>
        <div class="stat-card card success">
          <div class="stat-value">${completedProducts}/${flexPicking.length}</div>
          <div class="stat-label">Encontrados</div>
        </div>
      </div>

      ${Object.keys(carrierGroups).length > 0 ? `
        <div class="card mb-md">
          <h3 style="margin-bottom:12px;font-size:14px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Asignación de Transportistas Flex</h3>
          <div class="carrier-grid">
            ${Object.entries(carrierGroups).sort((a, b) => b[1].length - a[1].length).map(([carrier, items]) => {
      const isUnassigned = carrier === 'Sin asignar';
      const color = isUnassigned ? '#ef4444' : '#6366f1';
      return `
                <div class="carrier-column" style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;">
                  <div class="carrier-header" style="background: ${color}20; border-bottom: 2px solid ${color};">
                    <span style="color: ${color}">${isUnassigned ? '⚠️' : '🚚'} ${carrier}</span>
                    <span class="carrier-count" style="background: ${color}30; color: ${color}">${items.length}</span>
                  </div>
                  <div class="carrier-shipments">
                    ${items.map(s => `
                      <div class="carrier-shipment-item">
                        <div class="product">${s.product_name}</div>
                        <div class="destination">📍 ${s.city || 'N/A'}, ${s.province || 'N/A'} · CP ${s.postal_code || 'N/A'}</div>
                        <div style="margin-top:4px;color:var(--text-muted);font-size:12px;">👤 ${s.recipient_name || 'N/A'}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
    }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="progress-bar mb-md">
        <div class="progress-fill" style="width: ${flexPicking.length > 0 ? (completedProducts / flexPicking.length * 100).toFixed(0) : 0}%"></div>
      </div>

      <h3 style="margin-bottom:16px;font-size:14px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">
        Lista de Picking — Flex
      </h3>

      <div id="flex-picking-items">
        ${flexPicking.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">🚀</div>
            <p class="empty-state-text">No hay envíos Flex.<br>Subí etiquetas primero.</p>
          </div>
        ` : ''}
      </div>
    `;

    // Render picking items
    const container = document.getElementById('flex-picking-items');
    flexPicking.forEach((item, idx) => {
      const allFound = item.statuses.every(s => s !== 'pendiente');
      const el = document.createElement('div');
      el.className = `picking-item ${allFound ? 'completed' : ''}`;
      el.innerHTML = `
        <input type="checkbox" class="picking-checkbox" id="flex-pick-${idx}"
          ${allFound ? 'checked' : ''}
          data-ids="${item.shipment_ids.join(',')}" />
        <div class="picking-qty" style="background:var(--accent-light);">${item.total_quantity}</div>
        <div class="picking-info">
          <div class="picking-name">${item.product_name}</div>
          <div class="picking-sku">
            SKU: ${item.sku || 'N/A'}
            ${item.color ? ` · ${item.color}` : ''}
            · ${item.shipment_count} envío${item.shipment_count > 1 ? 's' : ''}
          </div>
        </div>
      `;
      container.appendChild(el);
    });

    // Checkbox handlers
    container.querySelectorAll('.picking-checkbox').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const ids = e.target.dataset.ids.split(',').map(Number);
        const newStatus = e.target.checked ? 'encontrado' : 'pendiente';
        try {
          const params = new URLSearchParams();
          ids.forEach(id => params.append('shipment_ids', id));
          params.append('status', newStatus);
          await fetch(`${import.meta.env.VITE_API_URL || ''}/api/shipments/batch-status?${params.toString()}`, { method: 'PATCH' });
          e.target.closest('.picking-item').classList.toggle('completed', e.target.checked);
          toast(`${ids.length} envío${ids.length > 1 ? 's' : ''} → ${newStatus}`, 'success');
        } catch (err) {
          toast('Error actualizando estado', 'error');
          e.target.checked = !e.target.checked;
        }
      });
    });

    // Recalculate carriers
    document.getElementById('btn-recalc-flex')?.addEventListener('click', async () => {
      try {
        const btn = document.getElementById('btn-recalc-flex');
        btn.disabled = true;
        btn.innerHTML = '⏳ Recalculando...';

        const params = new URLSearchParams();
        if (state.currentBatchId) params.append('batch_id', state.currentBatchId);

        const res = await api(`/shipments/reassign-flex?${params.toString()}`, { method: 'POST' });

        toast(`✅ Asignaciones actualizadas (${res.updated} cambios de ${res.total_checked} envíos Flex)`, 'success');
        renderFlex(); // re-render the view
      } catch (err) {
        toast('Error al recalcular zonas', 'error');
        document.getElementById('btn-recalc-flex').disabled = false;
        document.getElementById('btn-recalc-flex').innerHTML = '🔄 Recalcular Zonas';
      }
    });

    // Mark all
    document.getElementById('btn-mark-all-flex')?.addEventListener('click', async () => {
      const unchecked = container.querySelectorAll('.picking-checkbox:not(:checked)');
      for (const cb of unchecked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 100));
      }
    });

  } catch (err) {
    section.innerHTML += `<p style="color:var(--danger);">Error: ${err.message}</p>`;
  }
}
