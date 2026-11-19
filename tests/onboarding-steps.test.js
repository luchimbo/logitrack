import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklistSteps, checklistProgress, tourStepsFor } from '../src/lib/onboardingSteps.js';

const empty = { connected: false, shipments: false, zones: false, labels: false };

test('un espacio vacío empieza en 0 de 4 y el avance cuenta solo pasos medibles', () => {
  const steps = buildChecklistSteps(empty, true);
  assert.equal(steps.length, 5);
  assert.deepEqual(checklistProgress(steps), { done: 0, total: 4 });
});

test('el paso del canal se completa con un canal o con envíos cargados', () => {
  assert.equal(buildChecklistSteps({ ...empty, connected: true }, true)[0].done, true);
  assert.equal(buildChecklistSteps({ ...empty, shipments: true }, true)[0].done, true);
});

test('quien no administra es llevado a subir etiquetas, no a Canales', () => {
  const [first] = buildChecklistSteps(empty, false);
  assert.equal(first.tab, 'upload');
  assert.match(first.detail, /administrador/);
  assert.equal(buildChecklistSteps(empty, true)[0].tab, 'integrations');
});

test('el avance refleja cada paso completado', () => {
  const steps = buildChecklistSteps({ connected: true, shipments: true, zones: true, labels: true }, true);
  assert.deepEqual(checklistProgress(steps), { done: 4, total: 4 });
});

test('el recorrido incluye canales solo para administradores', () => {
  assert.ok(tourStepsFor(true).some((step) => step.id === 'channel'));
  assert.ok(!tourStepsFor(false).some((step) => step.id === 'channel'));
  for (const canManage of [true, false]) {
    const steps = tourStepsFor(canManage);
    assert.equal(steps[0].id, 'welcome');
    assert.equal(steps.at(-1).id, 'picking');
    assert.equal(new Set(steps.filter((s) => s.tab).map((s) => s.tab)).size, steps.filter((s) => s.tab).length);
  }
});
