"use client";

import { useCallback, useEffect, useState } from 'react';
import styles from './GettingStarted.module.css';

export default function GettingStarted({ onNavigate, canManage }) {
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
  const steps = [
    { title:'Conectá un canal o cargá etiquetas', detail: status.connected ? 'Canal conectado' : status.shipments ? 'Ya hay envíos cargados' : 'Empezá conectando tu tienda o subiendo un archivo de etiquetas', done:status.connected || status.shipments, tab:canManage ? 'integrations' : 'upload', action:canManage ? 'Conectar canal' : 'Subir etiquetas' },
    { title:'Obtené tus primeros envíos', detail:status.shipments ? 'Hay envíos en tu espacio' : 'Importá pedidos o subí etiquetas para verlos acá', done:status.shipments, tab:'upload', action:'Subir etiquetas' },
    { title:'Configurá zonas para Flex', detail:status.zones ? 'Hay zonas configuradas' : 'Opcional si no usás Flex', done:status.zones, tab:'zoneConfig', action:'Configurar zonas' },
    { title:'Revisá el picking', detail:status.shipments ? 'Disponible con los envíos cargados' : 'Disponible cuando cargues envíos', tab:'pickingList', action:'Abrir picking' },
    { title:'Consultá tus etiquetas', detail:status.labels ? 'Hay etiquetas disponibles' : 'Aparecerán cuando cargues etiquetas compatibles', tab:'upload', action:'Ver etiquetas' },
  ];
  return <details className={styles.box} defaultOpen={!status.shipments}>
    <summary className={styles.summary}><span><strong>Primeros pasos</strong><small>Prepará tu espacio para operar</small></span><span className={styles.count}>{steps.filter(step => step.done).length}/3 configurados</span></summary>
    <ol className={styles.steps}>{steps.map((step, index) => <li key={step.title}>
      <span className={`${styles.marker} ${step.done ? styles.done : ''}`} aria-hidden="true">{step.done ? '✓' : index + 1}</span>
      <span className={styles.copy}><strong>{step.title}</strong><small>{step.detail}</small></span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate(step.tab)}>{step.action}</button>
    </li>)}</ol>
    {!canManage && !status.connected && <p className={styles.note}>Un administrador puede conectar los canales de venta.</p>}
  </details>;
}
