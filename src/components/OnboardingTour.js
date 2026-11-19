"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { tourStepsFor } from '@/lib/onboardingSteps';

export default function OnboardingTour({ activeTab, canManage = false, onClose, onNavigate }) {
  const [hasStarted, setHasStarted] = useState(false);
  const dialogRef = useRef(null);
  const STEPS = useMemo(() => tourStepsFor(canManage), [canManage]);
  const stepByTab = useMemo(() => STEPS.reduce((acc, item, index) => {
    if (item.tab) acc[item.tab] = index;
    return acc;
  }, {}), [STEPS]);
  const step = hasStarted ? (stepByTab[activeTab] ?? 1) : 0;
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
      onNavigate('operationToday');
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
    <div className="onboarding-overlay">
      <section ref={dialogRef} className="card onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-scroll">
        <div className="onboarding-heading">
          <div>
            <div className="onboarding-kicker">Recorrido inicial</div>
            <h3 id="onboarding-title">{step > 0 ? `${step}. ${current.title}` : current.title}</h3>
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
