"use client";

import { useState } from 'react';

const STEPS = [
  {
    title: 'Bienvenido a GeoModi',
    body: 'Este espacio te permite cargar etiquetas y seguir toda la operación logística sin mezclar datos con otros usuarios.',
    recommended: 'Subir primeras etiquetas',
  },
  {
    title: '1. Subí etiquetas',
    body: 'Empezá desde “Subir Etiquetas”. Ahí cargás los archivos ZPL/TXT y el sistema los transforma en envíos operativos.',
    tab: 'upload',
    recommended: 'Subir primeras etiquetas',
  },
  {
    title: '2. Revisá el Dashboard',
    body: 'En Dashboard vas a ver envíos, unidades y comparativas por período. Podés usar fecha o rango y aplicar los filtros manualmente.',
    tab: 'dashboard',
    recommended: 'Mirar métricas y comparativas',
  },
  {
    title: '3. Prepará Picking y operación',
    body: 'La Lista de Picking te resume productos y cantidades. Flex y Colecta separan la operación diaria para despacho.',
    tab: 'pickingList',
    recommended: 'Preparar el picking',
  },
];

const STEP_BY_TAB = STEPS.reduce((acc, step, index) => {
  if (step.tab) acc[step.tab] = index;
  return acc;
}, {});

export default function OnboardingTour({ activeTab, onClose, onNavigate }) {
  const [hasStarted, setHasStarted] = useState(false);
  const step = hasStarted ? (STEP_BY_TAB[activeTab] ?? 1) : 0;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (!hasStarted) {
      setHasStarted(true);
      onNavigate(STEPS[1].tab);
      return;
    }

    if (isLast) {
      onClose(true);
      return;
    }

    const nextStep = step + 1;
    const nextTab = STEPS[nextStep]?.tab;
    if (nextTab) onNavigate(nextTab);
  };

  const handleBack = () => {
    if (step === 0) return;

    if (step === 1) {
      setHasStarted(false);
      return;
    }

    const previousStep = step - 1;
    const previousTab = STEPS[previousStep]?.tab;
    if (previousTab) onNavigate(previousTab);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5, 8, 16, 0.72)', backdropFilter: 'blur(6px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '620px', padding: '28px' }}>
        <div className="flex-between mb-md" style={{ alignItems: 'flex-start', gap: '16px' }}>
          <div>
            <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '8px' }}>Tour guiado</div>
            <h3 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>{current.title}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.7 }}>{current.body}</p>
          </div>
          <div className="topbar-chip subtle">Página {step + 1} de {STEPS.length}</div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ height: '8px', borderRadius: '999px', background: 'var(--surface-hover)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`, borderRadius: '999px', background: 'var(--accent)', transition: 'width 180ms ease' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gap: '10px', marginBottom: '24px' }}>
          <div className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
            <div className="mobile-card-title">Qué podés hacer ahora</div>
            <div className="mobile-card-body" style={{ marginTop: '8px' }}>
              <div className="mobile-card-row"><span className="mobile-card-label">Paso recomendado</span><span className="mobile-card-value">{current.recommended}</span></div>
            </div>
          </div>
        </div>

        <div className="flex-between" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Omitir por ahora</button>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={handleBack}>Atrás</button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={handleNext}>
              {isLast ? 'Finalizar tour' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
