/* Upload Component - Drag & drop ZPL/TXT files */

import { api, toast, state, loadBatches } from '../main.js';

export function renderUpload() {
  const section = document.getElementById('section-upload');

  section.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">📤 Subir Etiquetas</h1>
      <p class="section-subtitle">Arrastrá o seleccioná los archivos ZPL/TXT de etiquetas de MercadoLibre</p>
    </div>

    <div class="upload-zone" id="upload-zone">
      <input type="file" class="upload-input" id="file-input" multiple accept=".txt,.zpl,.TXT,.ZPL" />
      <div class="upload-icon">📄</div>
      <p class="upload-title">Arrastrá archivos aquí</p>
      <p class="upload-subtitle">o hacé click para seleccionar — Archivos .txt o .zpl</p>
    </div>

    <div id="upload-progress" style="display:none;" class="mt-md">
      <div class="card">
        <div class="flex-between mb-md">
          <span>Procesando archivos...</span>
          <div class="spinner" style="width:24px;height:24px;margin:0;"></div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%;" id="progress-fill"></div>
        </div>
      </div>
    </div>

    <div id="upload-results" class="mt-lg"></div>

    <div id="recent-batches" class="mt-lg"></div>
  `;

  setupUploadHandlers();
  loadRecentBatches();
}

function setupUploadHandlers() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');

  // Drag & Drop
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  // Click select
  input.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });
}

async function handleFiles(fileList) {
  if (!fileList.length) return;

  const progress = document.getElementById('upload-progress');
  const progressFill = document.getElementById('progress-fill');
  progress.style.display = 'block';
  progressFill.style.width = '30%';

  const formData = new FormData();
  for (const file of fileList) {
    formData.append('files', file);
  }

  try {
    progressFill.style.width = '60%';

    const result = await fetch((import.meta.env.VITE_API_URL || '') + '/api/upload', {
      method: 'POST',
      body: formData,
    }).then(r => {
      if (!r.ok) throw new Error('Error al subir archivos');
      return r.json();
    });

    progressFill.style.width = '100%';

    state.currentBatchId = result.batch_id;
    state.shipments = result.shipments;
    await loadBatches();

    toast(`✅ ${result.total_parsed} nuevos envíos agregados al lote del día (${result.total_in_batch} total)${result.total_skipped ? ` — ${result.total_skipped} duplicados omitidos` : ''}`, 'success');

    setTimeout(() => {
      progress.style.display = 'none';
      showUploadResults(result);
    }, 500);

  } catch (err) {
    progress.style.display = 'none';
    toast(`Error: ${err.message}`, 'error');
  }
}

function showUploadResults(result) {
  const container = document.getElementById('upload-results');

  // Count by method
  const byMethod = {};
  result.shipments.forEach(s => {
    byMethod[s.shipping_method] = (byMethod[s.shipping_method] || 0) + 1;
  });

  container.innerHTML = `
    <div class="card" style="border-color: var(--success); border-left: 4px solid var(--success);">
      <h3 style="margin-bottom:16px;">✅ Lote del día — ${new Date().toLocaleDateString('es-AR')}</h3>
      <div class="stats-grid">
        <div class="stat-card card accent">
          <div class="stat-value">${result.total_in_batch}</div>
          <div class="stat-label">Total en el día</div>
        </div>
        <div class="stat-card card success">
          <div class="stat-value">${result.total_parsed}</div>
          <div class="stat-label">Nuevos agregados</div>
        </div>
        <div class="stat-card card info">
          <div class="stat-value">${byMethod['flex'] || 0}</div>
          <div class="stat-label">Flex (nuevos)</div>
        </div>
        <div class="stat-card card warning">
          <div class="stat-value">${byMethod['colecta'] || 0}</div>
          <div class="stat-label">Colecta (nuevos)</div>
        </div>
      </div>
      ${result.total_skipped > 0 ? `
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px;">
          ⚠️ ${result.total_skipped} envío${result.total_skipped > 1 ? 's' : ''} duplicado${result.total_skipped > 1 ? 's' : ''} omitido${result.total_skipped > 1 ? 's' : ''} (ya estaban cargados)
        </p>
      ` : ''}
      <div class="flex-between gap-sm" style="flex-wrap:wrap;">
        <span style="color:var(--text-secondary);font-size:13px;">
          Archivos subidos: ${result.filenames.join(', ')}
        </span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-section=picking]').click()">
            📋 Ver Picking
          </button>
          <button class="btn btn-ghost btn-sm" onclick="document.querySelector('[data-section=dashboard]').click()">
            📊 Dashboard
          </button>
        </div>
      </div>
    </div>
  `;
}

async function loadRecentBatches() {
  const container = document.getElementById('recent-batches');
  try {
    const batches = await api('/batches');
    if (!batches.length) return;

    container.innerHTML = `
      <h3 style="margin-bottom:16px;color:var(--text-secondary);font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
        Lotes Recientes
      </h3>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Paquetes</th>
              <th>Archivos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${batches.map(b => `
              <tr>
                <td><strong>#${b.id}</strong></td>
                <td>${b.created_at ? new Date(b.created_at).toLocaleString('es-AR') : b.date}</td>
                <td><span class="badge badge-flex">${b.total_packages}</span></td>
                <td style="color:var(--text-secondary);font-size:13px;">${b.filenames || '-'}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="window.__selectBatch(${b.id})">
                    Seleccionar
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    window.__selectBatch = (id) => {
      state.currentBatchId = id;
      const select = document.getElementById('batch-select');
      if (select) select.value = id;
      toast(`Lote #${id} seleccionado`, 'info');
    };

  } catch (e) {
    console.error(e);
  }
}
