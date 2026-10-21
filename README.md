# LogiTrack

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![Turso/libSQL](https://img.shields.io/badge/Turso-libSQL-4F46E5)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)
![npm](https://img.shields.io/badge/Package_Manager-npm-CB3837?logo=npm&logoColor=white)

Aplicacion web para operacion logistica diaria:

- subida y parseo de etiquetas ZPL
- gestion de envios Flex y Colecta
- asignacion de transportistas por zonas
- lista de picking
- dashboard operativo
- flujo V2 de impresion con sincronizacion a la app

---

## Stack

- Next.js 16 (App Router)
- React 19
- Turso / libSQL (`@libsql/client`)
- Deploy principal en Vercel

---

## Requisitos

- Node.js 18+
- npm
- Base Turso activa

---

## Variables de entorno

Crear `.env.local` en la raiz:

```env
TURSO_DATABASE_URL=libsql://<tu-db>.turso.io
TURSO_AUTH_TOKEN=<tu-token>
# Token Turso separado, limitado a lectura, para el portal externo de transportistas.
TURSO_READONLY_AUTH_TOKEN=<tu-token-de-solo-lectura>
# Secreto aleatorio de al menos 32 caracteres para firmar links externos.
CARRIER_PORTAL_SIGNING_SECRET=<secreto-largo-y-unico>
JWT_SECRET=<secreto-jwt-largo-y-unico>

# Exclusivo para el workspace GeoModi (slug legacy); no es parte del setup multicliente.
PRINT_AGENT_TOKEN=<token-secreto>
```

Notas:

- Si faltan `TURSO_DATABASE_URL` o `TURSO_AUTH_TOKEN`, la app no puede operar correctamente.
- El portal externo requiere además `TURSO_READONLY_AUTH_TOKEN`; no usa ni acepta la credencial de escritura.
- Si usas `/admin-login`, `JWT_SECRET` es obligatorio.
- Para GeoModi, si definís `PRINT_AGENT_TOKEN`, el agente de impresión debe mandar `x-print-agent-token`.
- Los workspaces multicliente no configuran ni utilizan este token.

---

## Correr local

```bash
npm install
npm run dev
```

App en `http://localhost:3000`.

Sandbox visual sin login ni DB:

- `http://localhost:3000/dev/geomodi-preview`
- usa datos mock permanentes para probar cambios de UI
- si definis `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, la pestaña mapa usa el componente real

Build de verificacion:

```bash
npm run build
```

---

## Scripts

### Costos, liquidaciones y entregas

En el menú de Operación están **Ventas y costos** y **Control de entregas**.

- Las ventas brutas pagadas de Mercado Libre se muestran junto a los gastos por
  zona y partido, en ARS y según fecha de despacho. Se suman los pedidos de cada
  paquete sin duplicar sus ventas entre conexiones ni su costo logístico.
  El porcentaje gasto/ventas usa solo envíos con ambos importes completos.
  No descuenta comisiones, impuestos ni devoluciones parciales; no equivale a
  facturación fiscal ni al neto acreditado. Ver [definiciones y alcance](docs/zonas-ventas-costos.md).

- En **Tarifas por zona**, un administrador carga precio ARS por envío, transportista,
  zona y fecha de vigencia. Las tarifas pertenecen al espacio de trabajo, aunque el
  catálogo de transportistas sea compartido. Una vigencia ya registrada no se sobrescribe.
- Flex utiliza el despacho confirmado por Mercado Libre, no la fecha prevista de la
  etiqueta. Se conserva la responsabilidad y el precio aplicado; agregar una tarifa
  histórica completa los envíos todavía sin precio, sin modificar los ya valorizados.
- Colecta utiliza `senders[].cost` de `/shipments/{id}/costs`, seleccionando el vendedor
  correspondiente. El importe del comprador y el importe bruto no sustituyen este costo.
- Las estadísticas se filtran por fecha de despacho. Quitar el período permite revisar
  envíos sin despacho confirmado o sin vínculo con Mercado Libre. Los importes
  desconocidos no se convierten en cero. Los totales incluyen estimaciones de Flex en curso,
  que se muestran separadas de los entregados aún sin liquidar.
- Las liquidaciones se crean por fecha de entrega: **borrador → cerrada → pagada**.
  El cierre vuelve a consultar los candidatos y los reserva en una transacción, con
  unicidad por espacio/envío físico. Guarda precio y detalle. Antes del pago pueden
  agregarse ajustes con motivo; después del pago la liquidación permanece inmutable.
- El tablero distingue estado, demora informada por ML y plazo estimado vencido.
  Los plazos de `lead_time` se presentan como fechas, sin inventar una cita horaria.
  El historial es completo y la preparación/impresión interna se muestra por separado.
- Las pantallas consultan la base cada 60 segundos mientras están visibles. **Actualizar
  desde Mercado Libre** recorre los envíos de la selección en lotes de hasta diez.

El esquema se agrega mediante `initDb` sin borrar datos operativos. La sincronización
manual, los webhooks y el proceso diario utilizan la misma captura. Se conserva el
último detalle válido ante fallos. El proceso diario también recupera notificaciones
pendientes y reintentos persistentes, y reconcilia hasta 25 envíos por cuenta por pasada,
priorizando los intentos más antiguos; no está limitado a las ventas recientes.

Interfaces autenticadas: `GET /api/logistics-finance` (filtros, `format=csv`,
`view=rates`, `view=settlements`, `id` para detalle), `POST /api/logistics-finance`
(`action=rate|draft|close|pay|adjust`, solo administradores) y
`POST /api/logistics-finance/sync` (actualización de envíos existentes en el espacio).
Los portales públicos de transportistas no exponen estos datos financieros.

Los cálculos y la emisión de CSV son internos: no se emiten comprobantes fiscales
ni se realizan transferencias. Subsidios Flex y recargos por peso/producto quedan fuera.

### Comandos

- `npm run dev`: entorno local
- `npm run build`: build produccion
- `npm run start`: servir build
- `npm run lint`: lint
- `npm run bootstrap:legacy-admin -- --username <usuario> --password <clave-segura>`: crear o rotar admin legacy
- `npm run db:pull-prod:yes`: borrar la base Turso local y copiar schema/datos desde produccion

---

## Admin legacy

- El acceso `/admin-login` sigue disponible, pero ya no existe credencial por defecto.
- El endpoint `/api/fix` fue eliminado.
- Para crear o rotar el admin legacy usÃ¡:

```bash
npm run bootstrap:legacy-admin -- --username admin --password "<clave-segura-de-8+-caracteres>"
```

---

## Flujo principal (web)

Desde la UI principal (`/`):

- `Subir Etiquetas`: parsea labels y guarda en `shipments`
- `Logistica Flex`: resumen operativo, transportistas y zonas detectadas
- `Colecta`: gestion de estado
- `Lista de Picking`: consolidado por SKU
- `Dashboard`: metricas por periodo
- `Config. Zonas`: mapeo `partido -> carrier`

API relevante:

- `POST /api/upload`
- `GET /api/shipments`
- `PATCH /api/shipments`
- `DELETE /api/shipments/[id]`
- `POST /api/shipments/reassign-flex`
- `GET /api/dashboard`
- `GET /api/flex-health`

---

## Flujo V2 de impresion (drag and drop)

Hay 2 opciones:

1. Desarrollo dentro del repo (`v2/print-agent`)
2. Paquete portable (`PAQUETE-IMPRESION-V2.zip`)

### Comandos/bats operativos

- `imprimir-v2.bat`
  - ordena por SKU (cantidad desc, empate alfabetico)
  - imprime
  - sincroniza con API V2

- `reintentar-sync-v2.bat`
  - reintenta cola pendiente sin imprimir

- `reingestar-sin-imprimir-v2.bat`
  - sincroniza a la app sin volver a imprimir

### Integridad (critico)

Antes de imprimir, el agente valida:

- cantidad de bloques entrada/salida
- huellas (fingerprints) del set completo de etiquetas

Si hay mismatch:

- NO imprime
- NO usa fallback legacy
- genera reporte `*.integrity.json` en `print-agent/data`

---

## Endpoints V2 (print jobs)

- `POST /api/v2/print-jobs/intake`
- `GET /api/v2/print-jobs`
- `GET /api/v2/print-jobs/[jobId]`
- `POST /api/v2/print-jobs/backfill`

Contrato estricto de intake:

- requiere `agent_version`
- requiere bloque `integrity`
- requiere `raw_block` + `label_fingerprint` por item

Si el contrato no cierra, responde `422` y no contamina operacion.

---

## Asignacion por zonas (Flex)

La asignacion usa `zone_mappings` y normalizacion de `partido`.

Semaforo operativo:

- `GET /api/flex-health?period=today`

Estados:

- `green`: todo asignado
- `yellow`: hay datos incompletos/no mapeados
- `red`: hay envios asignables sin carrier

---

## Reglas de negocio destacadas

- Separacion entre trazabilidad de impresion (`print_jobs`) y operacion (`shipments`).
- Reprints no deben inflar operacion, pero si quedar auditables.
- Se recuperan envios faltantes si quedaron marcados reprint pero no existen en `shipments`.
- Split La Matanza:
  - `la_matanza_sur` -> GBA 2
  - `la_matanza_norte` -> GBA 1

---

## Deploy

Flujo recomendado:

1. Commit/push a `main`
2. Esperar deploy en Vercel
3. Verificar endpoints criticos:

```bash
curl -s https://logitrack-tan.vercel.app/api/flex-health?period=today
curl -s https://logitrack-tan.vercel.app/api/v2/print-jobs?limit=1
```

---

## Troubleshooting rapido

### "File processing failed" al subir etiquetas

- Revisar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`
- Revisar logs de Vercel Functions

### Imprimio pero no aparece en la app

- Revisar `print-agent/data/last_run.log`
- Confirmar `Sync OK (...)`
- Usar `reingestar-sin-imprimir-v2.bat`

### Flex sin transportista

- Revisar `GET /api/flex-health?period=today`
- Ejecutar `POST /api/shipments/reassign-flex`
- Completar mapeos en `Config. Zonas`

### Error de integridad de impresion

- Revisar `print-agent/data/*.integrity.json`
- No forzar fallback
- Reintentar con el archivo fuente original
