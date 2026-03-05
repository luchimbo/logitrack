# V2 Scope (fase inicial)

## Objetivo

Implementar flujo de impresion V2 sin afectar la app actual.

## Incluido en esta fase

- Agente local en `v2/print-agent`
- Drag-and-drop via `imprimir-v2.bat`
- Orden por SKU (cantidad desc, empate alfabetico)
- Marcado de reprint local por tracking repetido
- Sync best-effort (si falla, queda en pendiente y reintenta)
- API V2 implementada:
  - `POST /api/v2/print-jobs/intake`
  - `GET /api/v2/print-jobs`
  - `GET /api/v2/print-jobs/[jobId]`

## Pendiente de siguientes fases

- Panel UI de historial de impresion/reimpresiones
- Integrar UI V2 con endpoints `/api/v2/print-jobs`
- Reconciliacion avanzada con `label_fingerprint` tambien en `shipments` (opcional)
