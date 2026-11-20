"use client";

import { useCallback, useEffect, useState } from 'react';
import styles from './GettingStarted.module.css';
import { buildChecklistSteps, checklistProgress } from '@/lib/onboardingSteps';

export default function GettingStarted({ onNavigate, canManage, onReplayTour }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/onboarding/status', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No pudimos cargar los primeros pasos. Intentá de nuevo.');
      setStatus(result);
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!status && !error) return null;
  if (error) return <div className={`${styles.box} ${styles.error}`} role="alert">{error} <button className="btn btn-ghost btn-sm" onClick={load}>Reintentar</button></div>;
  const steps = buildChecklistSteps(status, canManage);
  const progress = checklistProgress(steps);
  if (progress.total > 0 && progress.done === progress.total) {
    // Once everything is done the checklist only takes space; keep a quiet way back to the tour.
    return onReplayTour ? <div className={styles.doneLine}><span aria-hidden="true">✓</span> Tu espacio está listo para operar.<button type="button" className="btn btn-ghost btn-sm" onClick={onReplayTour}>Ver recorrido de nuevo</button></div> : null;
  }
  return <details className={styles.box} open={!status.shipments || undefined}>
    <summary className={styles.summary}><span><strong>Primeros pasos</strong><small>Prepará tu espacio para operar</small></span><span className={styles.count}>{progress.done}/{progress.total} completados</span></summary>
    <ol className={styles.steps}>{steps.map((step, index) => <li key={step.title}>
      <span className={`${styles.marker} ${step.done ? styles.done : ''}`} aria-hidden="true">{step.done ? '✓' : index + 1}</span>
      <span className={styles.copy}><strong>{step.title}</strong><small>{step.detail}</small></span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate(step.tab)}>{step.action}</button>
    </li>)}</ol>
    {onReplayTour && <button type="button" className="btn btn-ghost btn-sm" onClick={onReplayTour}>Ver recorrido de nuevo</button>}
  </details>;
}
