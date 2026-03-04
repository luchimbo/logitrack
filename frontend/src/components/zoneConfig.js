/* Zone Config Component - Manage GBA zones for Flex carriers without map */

import { api, toast } from '../main.js';

const PARTIDOS = [
  // ── CAPITAL ──
  { id: 'capital_federal', name: 'CABA', zone: 'capital' },

  // ── GBA 1 (inner ring) ──
  { id: 'san_isidro', name: 'San Isidro', zone: 'gba1' },
  { id: 'vicente_lopez', name: 'V. López', zone: 'gba1' },
  { id: 'san_fernando', name: 'San Fernando', zone: 'gba1' },
  { id: 'san_martin', name: 'San Martín', zone: 'gba1' },
  { id: '3_de_febrero', name: '3 de Febrero', zone: 'gba1' },
  { id: 'hurlingham', name: 'Hurlingham', zone: 'gba1' },
  { id: 'ituzaingo', name: 'Ituzaingó', zone: 'gba1' },
  { id: 'moron', name: 'Morón', zone: 'gba1' },
  { id: 'avellaneda', name: 'Avellaneda', zone: 'gba1' },
  { id: 'lanus', name: 'Lanús', zone: 'gba1' },

  // ── GBA 2 (middle ring) ──
  { id: 'tigre', name: 'Tigre', zone: 'gba2' },
  { id: 'malvinas_argentinas', name: 'Malvinas Arg.', zone: 'gba2' },
  { id: 'jose_c_paz', name: 'J.C. Paz', zone: 'gba2' },
  { id: 'san_miguel', name: 'San Miguel', zone: 'gba2' },
  { id: 'moreno', name: 'Moreno', zone: 'gba2' },
  { id: 'merlo', name: 'Merlo', zone: 'gba2' },
  { id: 'la_matanza', name: 'La Matanza', zone: 'gba2' },
  { id: 'ezeiza', name: 'Ezeiza', zone: 'gba2' },
  { id: 'esteban_echeverria', name: 'E. Echeverría', zone: 'gba2' },
  { id: 'almirante_brown', name: 'A. Brown', zone: 'gba2' },
  { id: 'lomas_de_zamora', name: 'Lomas de Zamora', zone: 'gba2' },
  { id: 'quilmes', name: 'Quilmes', zone: 'gba2' },
  { id: 'berazategui', name: 'Berazategui', zone: 'gba2' },
  { id: 'florencio_varela', name: 'F. Varela', zone: 'gba2' },

  // ── GBA 3 (outer ring) ──
  { id: 'escobar', name: 'Escobar', zone: 'gba3' },
  { id: 'pilar', name: 'Pilar', zone: 'gba3' },
  { id: 'general_rodriguez', name: 'Gral. Rodríguez', zone: 'gba3' },
  { id: 'marcos_paz', name: 'Marcos Paz', zone: 'gba3' },
  { id: 'canuelas', name: 'Cañuelas', zone: 'gba3' },
  { id: 'san_vicente', name: 'San Vicente', zone: 'gba3' },
  { id: 'pte_peron', name: 'Pte. Perón', zone: 'gba3' },
  { id: 'ensenada', name: 'Ensenada', zone: 'gba3' },
  { id: 'la_plata', name: 'La Plata', zone: 'gba3' },
  { id: 'berisso', name: 'Berisso', zone: 'gba3' },
];

const ZONE_COLORS = {
  capital: '#ff69b4',  // Hot pink
  gba1: '#20b2aa',     // Light sea green
  gba2: '#00008b',     // Dark blue
  gba3: '#ff0000',     // Red
};

const ZONE_GROUPS = [
  { id: 'capital', label: 'CAPITAL' },
  { id: 'gba1', label: 'GBA 1' },
  { id: 'gba2', label: 'GBA 2' },
  { id: 'gba3', label: 'GBA 3 OPCIONAL' }
];

let zoneMapData = {};

export async function renderZones() {
  const section = document.getElementById('section-zones');
  section.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">⚙️ Configuración de Zonas Flex</h1>
      <p class="section-subtitle">Asigná partidos a transportistas por zonas</p>
    </div>
    <div class="spinner"></div>
  `;

  try {
    const [zones, carriers] = await Promise.all([
      api('/zones'),
      api('/carriers'),
    ]);

    // Build zone lookup: partido_id -> { carrier_name, carrier_color }
    zoneMapData = {};
    zones.forEach(z => {
      zoneMapData[z.partido] = {
        carrier_name: z.carrier_name,
        zone_id: z.id,
      };
    });

    const carrierOptions = carriers.map(c => `<option value="${c.name}">${c.display_name || c.name}</option>`).join('');

    section.innerHTML = `
      <div class="section-header">
        <h1 class="section-title">⚙️ Configuración de Zonas Flex</h1>
        <p class="section-subtitle">Asigná transportistas a cada partido del AMBA</p>
      </div>

      <!-- Carrier Management -->
      <div class="card mb-lg">
        <h3 style="margin-bottom:16px;font-size:16px;font-weight:700;">🚚 Transportistas Flex Activos</h3>
        <div class="form-row mb-md">
          <div class="form-group">
            <label class="form-label">Identificador / Usuario</label>
            <input type="text" class="form-input" id="carrier-name" placeholder="ej: moto_juan" />
          </div>
          <div class="form-group">
            <label class="form-label">Nombre para mostrar</label>
            <input type="text" class="form-input" id="carrier-display" placeholder="ej: Juan" />
          </div>
          <div class="form-group">
            <label class="form-label">Color (Opcional)</label>
            <input type="color" class="form-input" id="carrier-color" value="#6366f1" style="height:40px;padding:4px;" />
          </div>
          <button class="btn btn-primary" id="btn-add-carrier" style="height:40px;">+ Agregar</button>
        </div>
        <div id="carriers-list" style="display:flex;gap:12px;flex-wrap:wrap;">
          ${carriers.length === 0 ? '<p style="color:var(--text-muted);font-size:14px;">Agregá al menos un transportista para poder asignar zonas.</p>' : ''}
          ${carriers.map(c => `
            <div style="display:flex;align-items:center;gap:8px;background:var(--surface-hover);padding:8px 14px;border-radius:var(--radius);border:1px solid var(--border);">
              <div style="width:14px;height:14px;border-radius:3px;background:${c.color || '#6366f1'}"></div>
              <span style="font-weight:600;font-size:13px;">${c.display_name || c.name}</span>
              <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;color:var(--danger);" onclick="window.__deleteCarrier(${c.id})" title="Eliminar">✕</button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Zones Grid -->
      <h3 style="margin-bottom:16px;font-size:18px;font-weight:700;">📍 Asignación de Partidos</h3>
      
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;">
        ${ZONE_GROUPS.map(group => {
      const groupColor = ZONE_COLORS[group.id];
      const groupPartidos = PARTIDOS.filter(p => p.zone === group.id);

      return `
            <div class="card" style="border-top: 4px solid ${groupColor}; padding: 0;">
              
              <div style="padding:16px; border-bottom:1px solid var(--border); background: var(--surface-hover);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                  <h4 style="margin:0;font-size:15px;font-weight:800;color:${groupColor};">${group.label}</h4>
                  <span class="badge" style="background:${groupColor}20;color:${groupColor};">${groupPartidos.length} zonas</span>
                </div>
                
                <div style="display:flex;gap:8px;align-items:center;">
                  <select class="form-select group-carrier-select" id="group-select-${group.id}" style="font-size:12px;flex:1;">
                    <option value="">— Asignar a todos —</option>
                    ${carrierOptions}
                  </select>
                  <button class="btn btn-primary btn-sm btn-assign-group" data-group="${group.id}" style="padding:6px 12px;font-size:12px;">Aplicar</button>
                </div>
              </div>

              <div style="padding:16px;">
                ${groupPartidos.map(p => {
        const assigned = zoneMapData[p.id];
        const carrierDisplay = assigned ? (carriers.find(c => c.name === assigned.carrier_name)?.display_name || assigned.carrier_name) : 'Sin asignar';

        return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed var(--border);">
                      <div style="font-size:13px;font-weight:600; ${assigned ? 'color:var(--text);' : 'color:var(--text-muted);'}">
                        ${p.name}
                      </div>
                      <div style="display:flex;gap:8px;align-items:center;">
                        ${assigned ? `
                          <span class="badge badge-flex" style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🚚 ${carrierDisplay}</span>
                          <button class="btn btn-ghost btn-sm btn-remove-zone" data-zone-id="${assigned.zone_id}" style="padding:2px 6px;font-size:11px;color:var(--danger);">✕</button>
                        ` : `
                          <select class="form-select individual-carrier-select" data-partido="${p.id}" style="font-size:11px;padding:4px;width:130px;background:var(--bg-secondary);">
                            <option value="">No envia</option>
                            ${carrierOptions}
                          </select>
                        `}
                      </div>
                    </div>
                  `;
      }).join('')}
              </div>

            </div>
          `;
    }).join('')}
      </div>
    `;

    // ── Event Handlers ──

    // Add carrier
    document.getElementById('btn-add-carrier').addEventListener('click', async () => {
      const name = document.getElementById('carrier-name').value.trim();
      const display = document.getElementById('carrier-display').value.trim();
      const color = document.getElementById('carrier-color').value;
      if (!name) { toast('Ingresá un nombre', 'error'); return; }
      try {
        const params = new URLSearchParams({ name });
        if (display) params.append('display_name', display);
        if (color) params.append('color', color);
        await fetch(`/api/carriers?${params.toString()}`, { method: 'POST' });
        toast(`Transportista agregado`, 'success');
        renderZones();
      } catch (err) { toast('Error', 'error'); }
    });

    window.__deleteCarrier = async (id) => {
      if (!confirm('¿Seguro que querés eliminar este transportista?')) return;
      await fetch(`/api/carriers/${id}`, { method: 'DELETE' });
      renderZones();
    };

    // Remove single zone assignment
    document.querySelectorAll('.btn-remove-zone').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const zoneId = e.currentTarget.dataset.zoneId;
        await fetch(`/api/zones/${zoneId}`, { method: 'DELETE' });
        renderZones();
      });
    });

    // Assign single zone
    document.querySelectorAll('.individual-carrier-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const carrier = e.target.value;
        const partido = e.target.dataset.partido;
        if (!carrier) return;

        try {
          const params = new URLSearchParams({ partido, carrier_name: carrier });
          await fetch(`/api/zones?${params.toString()}`, { method: 'POST' });
          toast('Asignado correctamente', 'success');
          renderZones();
        } catch (err) {
          toast('Error asignando', 'error');
        }
      });
    });

    // Assign group
    document.querySelectorAll('.btn-assign-group').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const group = e.currentTarget.dataset.group;
        const carrier = document.getElementById(`group-select-${group}`).value;
        if (!carrier) { toast('Seleccioná un transportista primero', 'error'); return; }

        const groupPartidos = PARTIDOS.filter(p => p.zone === group).map(p => p.id);

        let assignedCount = 0;
        try {
          for (let p of groupPartidos) {
            // Unassign first if exists
            if (zoneMapData[p]) {
              await fetch(`/api/zones/${zoneMapData[p].zone_id}`, { method: 'DELETE' });
            }
            // Assign new
            const params = new URLSearchParams({ partido: p, carrier_name: carrier });
            await fetch(`/api/zones?${params.toString()}`, { method: 'POST' });
            assignedCount++;
          }
          toast(`${assignedCount} zonas de ${group} asignadas a ${carrier}`, 'success');
          renderZones();
        } catch (err) {
          toast('Hubo un error asignando algunas zonas', 'error');
          renderZones();
        }
      });
    });


  } catch (err) {
    section.innerHTML += `<p style="color:var(--danger);">Error: ${err.message}</p>`;
  }
}
