# V2 Setup Rapido

## 1) Backend (este proyecto)

1. Desplegar cambios con rutas `/api/v2/print-jobs/*`
2. (Opcional recomendado) definir `PRINT_AGENT_TOKEN` en Vercel

## 2) Agente local

1. Copiar `v2/print-agent/config.example.json` a `v2/print-agent/config.json`
2. Completar:
   - `syncUrl`: `https://<tu-app>/api/v2/print-jobs/intake`
   - `syncToken`: mismo valor de `PRINT_AGENT_TOKEN` (si aplica)
   - `printerPath`: recurso compartido local

## 3) Uso diario

1. Arrastrar etiquetas sobre `imprimir-v2.bat`
2. El agente imprime en orden por SKU y sincroniza
3. Si no hay internet/API, guarda en `pending_jobs.json` y reintenta solo
4. Si queres forzar reintento manual: `reintentar-sync-v2.bat`

## 4) Verificacion

- `GET /api/v2/print-jobs`
- `GET /api/v2/print-jobs/[jobId]`
- UI: `https://<tu-app>/v2/print-jobs`
