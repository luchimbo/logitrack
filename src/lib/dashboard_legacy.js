/* Dashboard Component - Summary metrics split by Colecta / Flex */

import { api, state } from '../main.js';

export async function renderDashboard() {
  const section = document.getElementById('section-dashboard');
  section.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">­ƒôè Dashboard</h1>
      <p class="section-subtitle">Resumen del d├¡a</p>
    </div>
    <div class="spinner"></div>
  `;

  try {
    const batchParam = state.currentBatchId ? `?batch_id=${state.currentBatchId}` : '';
    const data = await api(`/dashboard${batchParam}`);

    if (data.total_packages === 0) {
      section.innerHTML = `
        <div class="section-header">
          <h1 class="section-title">­ƒôè Dashboard</h1>
          <p class="section-subtitle">Resumen del d├¡a</p>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">­ƒôè</div>
          <p class="empty-state-text">No hay datos para mostrar.<br>Sub├¡ etiquetas para ver el dashboard.</p>
        </div>
      `;
      return;
    }

    const colectaCount = data.by_method?.colecta || 0;
    const flexCount = data.by_method?.flex || 0;

    const statusOrder = ['pendiente', 'encontrado', 'empaquetado', 'despachado'];
    const statusColors = { pendiente: 'warning', encontrado: 'info', empaquetado: 'accent', despachado: 'success' };
    const statusIcons = { pendiente: 'ÔÅ│', encontrado: '­ƒöì', empaquetado: '­ƒôª', despachado: 'Ô£à' };

    section.innerHTML = `
      <div class="section-header">
        <h1 class="section-title">­ƒôè Dashboard</h1>
        <p class="section-subtitle">Resumen del d├¡a ÔÇö ${new Date().toLocaleDateString('es-AR')}</p>
      </div>

      <!-- Main Stats -->
      <div class="stats-grid">
        <div class="stat-card card accent">
          <div class="stat-value">${data.total_packages}</div>
          <div class="stat-label">Total Paquetes</div>
        </div>
        <div class="stat-card card info">
          <div class="stat-value">${data.total_units}</div>
          <div class="stat-label">Total Unidades</div>
        </div>
        <div class="stat-card card warning">
          <div class="stat-value">${colectaCount}</div>
          <div class="stat-label">­ƒôª Colecta</div>
        </div>
        <div class="stat-card card success">
          <div class="stat-value">${flexCount}</div>
          <div class="stat-label">­ƒÜÇ Flex</div>
        </div>
      </div>

      <!-- Colecta & Flex side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">

        <!-- COLECTA Section -->
        <div class="card" style="border-top: 3px solid #f59e0b;">
          <h3 style="margin-bottom:16px;font-size:16px;font-weight:700;">­ƒôª Colecta ÔÇö ${colectaCount} paquetes</h3>
          ${colectaCount > 0 ? `
            <div class="chart-bar-container">
              ${Object.entries(data.by_carrier || {}).filter(([name]) => {
      // Colecta carriers: OCASA, PICKIT, Sin asignar, etc. (not flex assigned)
      return name !== 'Sin asignar' || colectaCount > 0;
    }).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([carrier, count], i) => {
      const pct = data.total_packages > 0 ? (count / data.total_packages * 100) : 0;
      const colors = ['warning', 'info', 'success', 'accent', 'danger'];
      return `
                  <div class="chart-bar-row">
                    <div class="chart-bar-label">­ƒÜÜ ${carrier}</div>
                    <div class="chart-bar-track">
                      <div class="chart-bar-fill ${colors[i % colors.length]}" style="width:${Math.max(pct, 3)}%">${count}</div>
                    </div>
                  </div>
                `;
    }).join('')}
            </div>
          ` : '<p style="color:var(--text-muted);font-size:14px;">No hay env├¡os colecta</p>'}
        </div>

        <!-- FLEX Section -->
        <div class="card" style="border-top: 3px solid var(--accent);">
          <h3 style="margin-bottom:16px;font-size:16px;font-weight:700;">­ƒÜÇ Flex ÔÇö ${flexCount} paquetes</h3>
          ${flexCount > 0 ? `
            <p style="color:var(--text-secondary);font-size:14px;margin-bottom:8px;">
              Env├¡os Flex pendientes de despacho por transportista propio
            </p>
          ` : '<p style="color:var(--text-muted);font-size:14px;">No hay env├¡os flex</p>'}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;">
        <!-- Status Chart -->
        <div class="card">
          <h3 style="margin-bottom:20px;font-size:16px;font-weight:700;">Estado de Env├¡os</h3>
          <div class="chart-bar-container">
            ${statusOrder.map(status => {
      const count = data.by_status?.[status] || 0;
      const pct = data.total_packages > 0 ? (count / data.total_packages * 100) : 0;
      return `
                <div class="chart-bar-row">
                  <div class="chart-bar-label">${statusIcons[status]} ${status}</div>
                  <div class="chart-bar-track">
                    <div class="chart-bar-fill ${statusColors[status]}" style="width:${Math.max(pct, 2)}%">${count}</div>
                  </div>
                </div>
              `;
    }).join('')}
          </div>
        </div>

        <!-- Province Chart -->
        <div class="card">
          <h3 style="margin-bottom:20px;font-size:16px;font-weight:700;">Por Provincia</h3>
          <div class="chart-bar-container">
            ${Object.entries(data.by_province || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([prov, count], i) => {
      const pct = data.total_packages > 0 ? (count / data.total_packages * 100) : 0;
      const colors = ['accent', 'info', 'success', 'warning', 'danger'];
      return `
                <div class="chart-bar-row">
                  <div class="chart-bar-label">${prov}</div>
                  <div class="chart-bar-track">
                    <div class="chart-bar-fill ${colors[i % colors.length]}" style="width:${Math.max(pct, 2)}%">${count}</div>
                  </div>
                </div>
              `;
    }).join('')}
          </div>
        </div>
      </div>
    `;

  } catch (err) {
    section.innerHTML += `<p style="color:var(--danger);">Error: ${err.message}</p>`;
  }
}
