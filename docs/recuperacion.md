# Recuperación y continuidad de GeoModi

Actualizado el 19/11/2026. Describe lo medido y lo que sigue sin resolverse; no asume capacidades no comprobadas.

## Qué se protege hoy

| Dato | Copia | Estado |
|---|---|---|
| Base libSQL (pcmidi) | Respaldo nocturno en el mismo servidor + copia cifrada diaria en `D:\Logística\_backup\offhost` (tarea `GeoModi-Respaldo-Externo`, 02:00) | Restauración aislada verificada: integridad correcta, 54 tablas |
| Aceptaciones de cross-selling (Redis) | **Ninguna propia** | Sin respaldo. Dependen del proveedor de Redis |
| Configuración y variables (Vercel, Clerk, tiendas) | **Ninguna en este repositorio** | Reconstruir exige acceso a los paneles de cada servicio |
| Clave de la copia cifrada | DPAPI de la cuenta Windows actual | Sin custodia independiente |

Limitación declarada: la copia está en la misma PC (no fuera del sitio) y la clave solo se descifra con ese perfil de Windows. Perder la PC equivale a perder la copia externa y su clave.

## Herramientas agregadas (19/11/2026)

- **Retención de la copia cifrada:** `backup-offhost.ps1` elimina, después de crear y verificar una copia nueva, las de más de 30 días, sin bajar nunca de 7 archivos (`-RetentionDays`, `-MinimumCopies`). Aún no se ejecutó una eliminación real: todas las copias actuales son de hoy.
- **Custodia de la clave:** `backup-key-custody.ps1 -Export -CustodyFile <ruta>` genera un archivo protegido por una frase de paso (PBKDF2 + AES-GCM) que se guarda fuera de la PC; `-Import` lo recupera en otra cuenta. Probado en una carpeta temporal con una clave ficticia (la clave vuelve idéntica; una frase errónea se rechaza). **No se ejecutó sobre la clave real**: lo debe hacer el responsable, porque la frase no puede conocerla otra persona, y debe guardar el archivo y la frase por separado.
- **Redis:** `node scripts/backup-redis.mjs` (solo lectura: SCAN, TYPE, PTTL, GET, HGETALL) con `KV_REST_API_URL` y `KV_REST_API_TOKEN` en la terminal. Probado con un servidor simulado; **no se ejecutó contra el Redis real** (las credenciales viven en Vercel y no se extrajeron). Guarda en `_backup/redis`, fuera de Git; contiene datos de carritos.
- **Exportación por espacio:** `node scripts/export-workspace.mjs --workspace <id> [--write]`. Probada en simulación y con un recuento de solo lectura en producción (espacio 2).

## Riesgo aceptado: custodia de la clave (decisión del responsable, 19/11/2026)

El responsable decidió no generar un archivo de custodia independiente de la clave. Consecuencia: la clave de la copia cifrada solo se descifra con la cuenta de Windows actual. Si se pierde la PC o el perfil, las copias `.gmbak` quedan inutilizables y la recuperación depende únicamente del respaldo nocturno del servidor (mismo equipo que la base). `backup-key-custody.ps1` queda disponible si se revierte la decisión.

## Reintentos de sincronización

`node scripts/check-sync-health.mjs` (solo lectura) detecta reintentos acumulados (>200), vencidos (>120 min) o con 10 o más intentos; el control horario lo informa como **AVISO** sin cambiar el código de salida. Consulta del 19/11/2026: `ml_sync_retries` tiene 63 filas del 22 al 27/10 (espacio legacy, conexiones 91 y 3) con el error `Cannot read properties of null (reading 'logistic')`. El código actual protege esas lecturas con `?.` y nada reprocesa esas filas (solo se borran al sincronizar la orden con éxito). Diagnóstico (solo lectura): los 63 pedidos ya están guardados en `mercadolibre_orders` y los 63 son ventas sin envío, la causa corregida el 27/10 en `c98203b`; son restos residuales. `node scripts/clear-stale-sync-retries.mjs` simula la limpieza (63 coinciden, 0 quedan); `--apply --backup-verified` las elimina en una transacción. **No se aplicó.** Después de limpiar, el aviso debe pasar a error.

## Canal de alertas: propuesta (sin activar)

Hoy: notificación local de Windows solo con la PC encendida. Propuesta mínima: un correo de aviso desde el servidor (que está siempre encendido) a una casilla del responsable, o un mensaje a un canal de mensajería elegido por él, disparado por el mismo control. Requiere definir destinatario y canal, y credenciales de envío; no se envió ni configuró nada.

## Objetivos propuestos (a validar por el responsable)

- Pérdida máxima tolerable (RPO): 24 h para la base (respaldo diario); sin definir para Redis.
- Tiempo de recuperación (RTO): no medido de punta a punta. La verificación de descifrado, extracción e integridad de la copia de 91 MB completó en minutos; falta cronometrar la restauración completa sobre un servidor nuevo antes de comprometer un valor.

## Controles de disponibilidad

`scripts/check-operational-health.ps1` comprueba web pública, servicio libSQL, antigüedad del respaldo del servidor (36 h), tarea y copia externa. `scripts/monitor-operational-health.ps1` lo ejecuta cada hora (tarea `GeoModi-Control-Operativo`) y muestra una notificación local de Windows solo al pasar de correcto a error.

Límites: la alerta solo llega si la PC está encendida y con sesión iniciada; no hay canal externo (correo, mensajería) porque falta definir destinatario y canal; no vigila fallos de sincronización con tiendas ni acumulación de reintentos. El monitor depende de la ruta del runtime de PowerShell de Codex (se resuelve dinámicamente; si el paquete se desinstala, la tarea falla).

Prueba de falla simulada (19/11/2026): con un directorio de copias inexistente el control devuelve código 1 y lista los errores.

## Procedimiento de restauración de la base

1. `pwsh -NoProfile -File scripts/verify-offhost.ps1 -BackupFile '<archivo>.gmbak'` para validar integridad antes de usarlo.
2. Detener el servicio `geomodi-libsql` del servidor, conservar el archivo actual con otro nombre y colocar la base restaurada.
3. Iniciar el servicio, ejecutar `npm run db:check` y abrir la app.
4. Registrar hora de inicio y fin para medir el RTO real.

## Qué hacer ante cada falla

- **Servidor apagado o sin energía:** encenderlo; el servicio es de usuario y debe volver; revisar `systemctl --user status geomodi-libsql`. Funnel puede requerir `tailscale funnel status`.
- **Sin Internet o Funnel caído:** la app pública deja de ver la base; no hay pérdida de datos. Restablecer la conexión y volver a ejecutar el control.
- **Disco lleno:** liberar respaldos viejos del servidor; la copia externa no se borra sola, por lo que la retención debe definirse.
- **Credenciales vencidas:** renovar en el servicio correspondiente; no rotar las de cross-selling ni repetir OAuth sin instrucción.

## Migración de transportistas (tarifas históricas de un espacio)

Simulada sobre una copia restaurada (3 transportistas creados, integridad correcta). Consulta de solo lectura en producción del 19/11/2026: 3 asignaciones a crear, un espacio afectado. Para aplicar:

1. Verificar una copia reciente con `verify-offhost.ps1` y guardar su nombre.
2. `node scripts/apply-carrier-migration.mjs` (simulación) y revisar cantidades.
3. `node scripts/apply-carrier-migration.mjs --apply --backup-verified` (una transacción; se revierte ante error).
4. Revertir el código no deshace la migración: para volver atrás hay que restaurar la copia.

No se aplicó en producción.
