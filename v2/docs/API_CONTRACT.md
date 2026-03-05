# API V2 - Print Jobs

## POST `/api/v2/print-jobs/intake`

Ingesta de un job de impresion enviado por el agente local.

### Auth (opcional)

Si existe `PRINT_AGENT_TOKEN` en server, enviar header:

- `x-print-agent-token: <token>`

### Body (resumen)

```json
{
  "job_id": "job-20260304-20374689-2kciju",
  "created_at": "2026-03-04T20:37:46.895Z",
  "source_files": ["Etiqueta A.txt", "Etiqueta B.txt"],
  "printer_path": "\\\\127.0.0.1\\ZDesigner...",
  "sku_order": [{ "sku": "ABC123", "count": 8 }],
  "labels": [
    {
      "order": 1,
      "sku": "ABC123",
      "tracking_number": "46574299870",
      "label_fingerprint": "sha256...",
      "sale_id": "11832275985",
      "product_name": "Producto",
      "shipping_method": "flex",
      "is_reprint": false
    }
  ]
}
```

### Comportamiento de dedupe/reprint

- Si `job_id` ya existe: responde `duplicate: true` (idempotente).
- Reprint server-side si detecta:
  - `tracking_number` ya existente en `shipments` o `print_job_items`, o
  - `label_fingerprint` ya existente en `print_job_items`.

## GET `/api/v2/print-jobs`

- Devuelve resumen y lista de jobs recientes.
- Query opcional: `?limit=50`.

## GET `/api/v2/print-jobs/[jobId]`

- Devuelve cabecera + items de un job.
