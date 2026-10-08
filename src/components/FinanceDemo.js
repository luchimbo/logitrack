"use client";
import { useState } from 'react';
import FinanceSection from './FinanceSection';
import { financeDemo } from '@/lib/financeDemo';
export default function FinanceDemo() {
  const [mode, setMode] = useState('analysis');
  return <main style={{ width: '100%', padding: 'clamp(16px,4vw,48px)' }}><nav aria-label="Módulos de prueba" style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>{[['analysis', 'Ventas y costos'], ['rates', 'Tarifas'], ['tracking', 'Entregas']].map(([id, label]) => <button key={id} type="button" className="btn" aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}</nav><FinanceSection mode={mode} canManage demo={financeDemo} /></main>;
}
