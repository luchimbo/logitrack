"use client";

import { useEffect, useRef, useState } from 'react';

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
  const dialogRef = useRef(null);
  const step = hasStarted ? (STEP_BY_TAB[activeTab] ?? 1) : 0;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector('button')?.focus();
    document.body.classList.add('mobile-nav-open');
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose(false);
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = [...dialog.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('mobile-nav-open');
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

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
    <div className="onboarding-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(false); }}>
      <section ref={dialogRef} className="card onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-scroll">
        <div className="onboarding-heading">
          <div>
            <div className="onboarding-kicker">Recorrido inicial</div>
            <h3 id="onboarding-title">{current.title}</h3>
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
        </div>

        <div className="onboarding-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Omitir por ahora</button>
          <div>
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={handleBack}>Atrás</button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={handleNext}>
              {isLast ? 'Finalizar tour' : 'Siguiente'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
