"use client";

import { useState } from 'react';

const STEPS = [
  {
    title: 'Bienvenido a GeoModi',
    body: 'Este espacio te permite cargar etiquetas y seguir toda la operación logística sin mezclar datos con otros usuarios.',
  },
  {
    title: '1. Subí etiquetas',
    body: 'Empezá desde “Subir Etiquetas”. Ahí cargás los archivos ZPL/TXT y el sistema los transforma en envíos operativos.',
  },
  {
    title: '2. Revisá el Dashboard',
    body: 'En Dashboard vas a ver envíos, unidades y comparativas por período. Podés usar fecha o rango y aplicar los filtros manualmente.',
  },
  {
    title: '3. Prepará Picking y operación',
    body: 'La Lista de Picking te resume productos y cantidades. Flex y Colecta separan la operación diaria para despacho.',
  },
];

export default function OnboardingTour({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5, 8, 16, 0.72)', backdropFilter: 'blur(6px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '620px', padding: '28px' }}>
        <div className="flex-between mb-md" style={{ alignItems: 'flex-start', gap: '16px' }}>
          <div>
            <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '8px' }}>Tour guiado</div>
            <h3 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>{current.title}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.7 }}>{current.body}</p>
          </div>
          <div className="topbar-chip subtle">{step + 1}/{STEPS.length}</div>
        </div>

        <div style={{ display: 'grid', gap: '8px', marginBottom: '20px' }}>
          {STEPS.map((item, index) => (
            <div key={item.title} style={{ height: '6px', borderRadius: '999px', background: index <= step ? 'var(--accent)' : 'var(--surface-hover)', opacity: index <= step ? 1 : 0.5 }} />
          ))}
        </div>

        <div style={{ display: 'grid', gap: '10px', marginBottom: '24px' }}>
          <div className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
            <div className="mobile-card-title">Qué podés hacer ahora</div>
            <div className="mobile-card-body" style={{ marginTop: '8px' }}>
              <div className="mobile-card-row"><span className="mobile-card-label">Paso recomendado</span><span className="mobile-card-value">{step === 0 ? 'Subir primeras etiquetas' : step === 1 ? 'Validar envíos cargados' : step === 2 ? 'Mirar métricas y comparativas' : 'Preparar el picking'}</span></div>
            </div>
          </div>
        </div>

        <div className="flex-between" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Omitir por ahora</button>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setStep((prev) => prev - 1)}>Atrás</button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => isLast ? onClose(true) : setStep((prev) => prev + 1)}>
              {isLast ? 'Finalizar tour' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
