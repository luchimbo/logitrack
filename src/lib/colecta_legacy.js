/* Colecta Section - Picking list + stats for Colecta shipments only */

import { api, toast, state } from '../main.js';

export async function renderColecta() {
    const section = document.getElementById('section-colecta');
    section.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">­ƒôª Colecta</h1>
      <p class="section-subtitle">Env├¡os por Mercado Env├¡os (Colecta)</p>
    </div>
    <div class="spinner"></div>
  `;

    try {
        const batchParam = state.currentBatchId ? `?batch_id=${state.currentBatchId}` : '';
        const sep = batchParam ? '&' : '?';
        const [pickingList, shipments] = await Promise.all([
            api(`/picking-list${batchParam}`),
            api(`/shipments${batchParam}${sep}shipping_method=colecta`),
        ]);
        const colectaPicking = pickingList.filter(p => p.shipping_method === 'colecta');
        const totalPackages = shipments.length;
        const totalUnits = colectaPicking.reduce((sum, p) => sum + p.total_quantity, 0);
        const completedProducts = colectaPicking.filter(p => p.statuses.every(s => s !== 'pendiente')).length;

        // Count carriers
        const carriers = {};
        shipments.forEach(s => {
            const c = s.carrier_name || 'Sin nombre';
            carriers[c] = (carriers[c] || 0) + 1;
        });

        colectaPicking.sort((a, b) => {
            const aComplete = a.statuses.every(s => s !== 'pendiente');
            const bComplete = b.statuses.every(s => s !== 'pendiente');
            if (aComplete !== bComplete) return aComplete ? 1 : -1;
            return b.total_quantity - a.total_quantity;
        });

        section.innerHTML = `
      <div class="section-header flex-between">
        <div>
          <h1 class="section-title">­ƒôª Colecta</h1>
          <p class="section-subtitle">Env├¡os por Mercado Env├¡os (Colecta)</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-success btn-sm" id="btn-mark-all-colecta">Ô£ô Marcar todo encontrado</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card card warning">
          <div class="stat-value">${totalPackages}</div>
          <div class="stat-label">Paquetes Colecta</div>
        </div>
        <div class="stat-card card info">
          <div class="stat-value">${colectaPicking.length}</div>
          <div class="stat-label">Productos Distintos</div>
        </div>
        <div class="stat-card card accent">
          <div class="stat-value">${totalUnits}</div>
          <div class="stat-label">Unidades Total</div>
        </div>
        <div class="stat-card card success">
          <div class="stat-value">${completedProducts}/${colectaPicking.length}</div>
          <div class="stat-label">Encontrados</div>
        </div>
      </div>

      ${Object.keys(carriers).length > 0 ? `
        <div class="card mb-md">
          <h3 style="margin-bottom:12px;font-size:14px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Transportistas Colecta</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${Object.entries(carriers).sort((a, b) => b[1] - a[1]).map(([name, count]) => `
              <span class="badge badge-colecta" style="font-size:13px;padding:6px 14px;">­ƒÜÜ ${name}: ${count}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="progress-bar mb-md">
        <div class="progress-fill" style="width: ${colectaPicking.length > 0 ? (completedProducts / colectaPicking.length * 100).toFixed(0) : 0}%"></div>
      </div>

      <h3 style="margin-bottom:16px;font-size:14px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">
        Lista de Picking ÔÇö Colecta
      </h3>

      <div id="colecta-picking-items">
        ${colectaPicking.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">­ƒôª</div>
            <p class="empty-state-text">No hay env├¡os Colecta.<br>Sub├¡ etiquetas primero.</p>
          </div>
        ` : ''}
      </div>
    `;

        // Render picking items
        const container = document.getElementById('colecta-picking-items');
        colectaPicking.forEach((item, idx) => {
            const allFound = item.statuses.every(s => s !== 'pendiente');
            const el = document.createElement('div');
            el.className = `picking-item ${allFound ? 'completed' : ''}`;
            el.innerHTML = `
        <input type="checkbox" class="picking-checkbox" id="colecta-pick-${idx}"
          ${allFound ? 'checked' : ''}
          data-ids="${item.shipment_ids.join(',')}" />
        <div class="picking-qty">${item.total_quantity}</div>
        <div class="picking-info">
          <div class="picking-name">${item.product_name}</div>
          <div class="picking-sku">
            SKU: ${item.sku || 'N/A'}
            ${item.color ? ` ┬À ${item.color}` : ''}
            ┬À ${item.shipment_count} env├¡o${item.shipment_count > 1 ? 's' : ''}
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
                    toast(`${ids.length} env├¡o${ids.length > 1 ? 's' : ''} ÔåÆ ${newStatus}`, 'success');
                } catch (err) {
                    toast('Error actualizando estado', 'error');
                    e.target.checked = !e.target.checked;
                }
            });
        });

        // Mark all
        document.getElementById('btn-mark-all-colecta')?.addEventListener('click', async () => {
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
