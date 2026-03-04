/* ══════════════════════════════════════════
   LogiTrack - Main Application
   ══════════════════════════════════════════ */

import './style.css';
import { renderUpload } from './components/upload.js';
import { renderColecta } from './components/colecta.js';
import { renderFlex } from './components/flex.js';
import { renderDashboard } from './components/dashboard.js';
import { renderZones } from './components/zoneConfig.js';

// ── State ─────────────────────────────────
export const state = {
  currentSection: 'upload',
  currentBatchId: null,
  shipments: [],
  batches: [],
};

// ── API Helper ────────────────────────────
export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error de servidor' }));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

// ── Toast ─────────────────────────────────
export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Navigation ────────────────────────────
function navigate(section) {
  state.currentSection = section;

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === section);
  });

  document.querySelectorAll('.section').forEach(s => {
    s.classList.toggle('active', s.id === `section-${section}`);
  });

  renderSection(section);
}

function renderSection(section) {
  switch (section) {
    case 'upload': renderUpload(); break;
    case 'colecta': renderColecta(); break;
    case 'flex': renderFlex(); break;
    case 'dashboard': renderDashboard(); break;
    case 'zones': renderZones(); break;
  }
}

// ── Batch Selector ────────────────────────
export async function loadBatches() {
  try {
    state.batches = await api('/batches');
    renderBatchSelector();
  } catch (e) {
    console.error('Error loading batches:', e);
  }
}

function renderBatchSelector() {
  const container = document.getElementById('batch-selector');
  if (!state.batches.length) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-muted);">Sin lotes cargados</p>';
    return;
  }

  // Auto-select today's batch if nothing selected
  if (!state.currentBatchId) {
    const today = new Date().toISOString().slice(0, 10);
    const todayBatch = state.batches.find(b => b.date === today);
    state.currentBatchId = todayBatch ? todayBatch.id : state.batches[0].id;
  }

  const current = state.currentBatchId;

  container.innerHTML = `
    <label class="form-label">📅 Lote del día</label>
    <select class="form-select" id="batch-select" style="font-size:12px;padding:6px 8px;">
      ${state.batches.map(b => {
    const d = b.date || '';
    const label = d === new Date().toISOString().slice(0, 10) ? '📅 HOY' : d;
    return `
          <option value="${b.id}" ${b.id === current ? 'selected' : ''}>
            ${label} — ${b.total_packages} paq.
          </option>
        `;
  }).join('')}
    </select>
  `;

  document.getElementById('batch-select').addEventListener('change', (e) => {
    state.currentBatchId = e.target.value ? parseInt(e.target.value) : null;
    renderSection(state.currentSection);
  });
}

// ── Init ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.section);
    });
  });

  loadBatches();
  navigate('upload');
});
