/* Picking List Component - Consolidated product list split by Colecta / Flex */

import { api, toast, state } from '../main.js';

export async function renderPicking() {
  const section = document.getElementById('section-picking');
  section.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">📋 Lista de Picking</h1>
      <p class="section-subtitle">Productos a buscar — divididos por método de envío</p>
    </div>
    <div class="spinner"></div>
  `;

  try {
    const batchParam = state.currentBatchId ? `?batch_id=${state.currentBatchId}` : '';
    const pickingList = await api(`/picking-list${batchParam}`);

    if (!pickingList.length) {
      section.innerHTML = `
        <div class="section-header">
          <h1 class="section-title">📋 Lista de Picking</h1>
          <p class="section-subtitle">Productos a buscar — divididos por método de envío</p>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <p class="empty-state-text">No hay productos para buscar.<br>Subí etiquetas primero.</p>
        </div>
      `;
      return;
    }

    // Sort: non-completed first, then by quantity desc
    pickingList.sort((a, b) => {
      const aComplete = a.statuses.every(s => s !== 'pendiente');
      const bComplete = b.statuses.every(s => s !== 'pendiente');
      if (aComplete !== bComplete) return aComplete ? 1 : -1;
      return b.total_quantity - a.total_quantity;
    });

    // Split by method
    const colectaItems = pickingList.filter(p => p.shipping_method === 'colecta');
    const flexItems = pickingList.filter(p => p.shipping_method === 'flex');

    const totalProducts = pickingList.length;
    const totalUnits = pickingList.reduce((sum, p) => sum + p.total_quantity, 0);
    const colectaUnits = colectaItems.reduce((sum, p) => sum + p.total_quantity, 0);
    const flexUnits = flexItems.reduce((sum, p) => sum + p.total_quantity, 0);
    const completedProducts = pickingList.filter(p => p.statuses.every(s => s !== 'pendiente')).length;

    section.innerHTML = `
      <div class="section-header flex-between">
        <div>
          <h1 class="section-title">📋 Lista de Picking</h1>
          <p class="section-subtitle">${totalProducts} productos — ${totalUnits} unidades (${colectaItems.length} colecta, ${flexItems.length} flex)</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-success btn-sm" id="btn-mark-all-found">✓ Marcar todo encontrado</button>
        </div>
      </div>

      <div class="progress-bar mb-md">
        <div class="progress-fill" style="width: ${totalProducts > 0 ? (completedProducts / totalProducts * 100).toFixed(0) : 0}%"></div>
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">
        ${completedProducts} de ${totalProducts} productos encontrados (${totalProducts > 0 ? (completedProducts / totalProducts * 100).toFixed(0) : 0}%)
      </p>

      ${colectaItems.length > 0 ? `
        <div class="card mb-md" style="border-left: 3px solid #f59e0b;">
          <h3 style="margin-bottom:16px;font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px;">
            📦 Colecta
            <span class="badge badge-colecta">${colectaItems.length} productos · ${colectaUnits} uds</span>
          </h3>
          <div id="picking-colecta"></div>
        </div>
      ` : ''}

      ${flexItems.length > 0 ? `
        <div class="card" style="border-left: 3px solid var(--accent);">
          <h3 style="margin-bottom:16px;font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px;">
            🚀 Flex
            <span class="badge badge-flex">${flexItems.length} productos · ${flexUnits} uds</span>
          </h3>
          <div id="picking-flex"></div>
        </div>
      ` : ''}
    `;

    // Render items into their respective containers
    let globalIdx = 0;
    if (colectaItems.length > 0) {
      const colectaContainer = document.getElementById('picking-colecta');
      renderPickingItems(colectaContainer, colectaItems, globalIdx);
      globalIdx += colectaItems.length;
    }
    if (flexItems.length > 0) {
      const flexContainer = document.getElementById('picking-flex');
      renderPickingItems(flexContainer, flexItems, globalIdx);
    }

    // Checkbox handlers (delegation on section level)
    section.querySelectorAll('.picking-checkbox').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const ids = e.target.dataset.ids.split(',').map(Number);
        const newStatus = e.target.checked ? 'encontrado' : 'pendiente';

        try {
          const params = new URLSearchParams();
          ids.forEach(id => params.append('shipment_ids', id));
          params.append('status', newStatus);

          await fetch(`/api/shipments/batch-status?${params.toString()}`, { method: 'PATCH' });

          e.target.closest('.picking-item').classList.toggle('completed', e.target.checked);
          toast(`${ids.length} envío${ids.length > 1 ? 's' : ''} → ${newStatus}`, 'success');
        } catch (err) {
          toast('Error actualizando estado', 'error');
          e.target.checked = !e.target.checked;
        }
      });
    });

    // Mark all button
    document.getElementById('btn-mark-all-found')?.addEventListener('click', async () => {
      const unchecked = section.querySelectorAll('.picking-checkbox:not(:checked)');
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

function renderPickingItems(container, items, startIdx) {
  items.forEach((item, i) => {
    const idx = startIdx + i;
    const allFound = item.statuses.every(s => s !== 'pendiente');
    const el = document.createElement('div');
    el.className = `picking-item ${allFound ? 'completed' : ''}`;
    el.innerHTML = `
        <input type="checkbox" class="picking-checkbox" id="pick-${idx}"
          ${allFound ? 'checked' : ''}
          data-ids="${item.shipment_ids.join(',')}" />
        <div class="picking-qty">${item.total_quantity}</div>
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
}
