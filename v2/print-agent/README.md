# V2 Print Agent (isolado)

Este agente local mantiene drag-and-drop sobre `imprimir-v2.bat` y agrega:

- Orden de impresion por SKU (cantidad descendente, empate alfabetico)
- Deteccion local de reprint por `tracking_number`
- Cola de sincronizacion pendiente (imprime aunque falle la API)

## Uso

1. Copiar `config.example.json` a `config.json` (opcional para sync)
2. Arrastrar uno o mas `.txt/.zpl` sobre `imprimir-v2.bat`

## Integridad de impresion

- Antes de imprimir se valida que entrada y salida tengan el mismo set de etiquetas (hash/fingerprint).
- Si hay mismatch, se bloquea la impresion y se genera un reporte `data/*.integrity.json`.
- En ese caso no debe usarse fallback de impresion para evitar salir con paquetes incompletos.

Si no configuras `syncUrl`, el agente intenta automaticamente:

- `http://localhost:3000/api/v2/print-jobs/intake`
- `https://logitrack-tan.vercel.app/api/v2/print-jobs/intake`

Para solo reintentar sincronizacion pendiente (sin imprimir):

- ejecutar `reintentar-sync-v2.bat`

## Variables de entorno opcionales

- `PRINT_V2_PRINTER_PATH`
- `PRINT_V2_SYNC_URL`
- `PRINT_V2_SYNC_TOKEN`
- `PRINT_V2_DRY_RUN=1`

Estas variables pisan lo configurado en `config.json`.

Ejemplo de `syncUrl`:

- `https://tu-dominio.vercel.app/api/v2/print-jobs/intake`

Tambien se puede ejecutar manualmente con `--dry-run` para no imprimir fisicamente.
Tambien existe `--retry-only` para reintentar pendientes sin procesar archivos nuevos.

## Archivos locales generados

- `data/print_history.jsonl`: historial local de jobs
- `data/known_trackings.json`: indice para detectar reprints
- `data/pending_jobs.json`: cola pendiente de sincronizar
- `data/job-*.txt`: salida ZPL ordenada para impresion
- `data/last_run.log`: log util para diagnostico rapido
- `../..\ultimo_ordenado_v2.txt`: preview del ultimo orden generado

## Nota

Este agente no reemplaza el flujo actual. Es una capa nueva aislada en `v2/`.
