# Base GeoModi en PC MIDI

Procedimiento vigente desde el 29/10/2026. Los datos operativos están en libSQL propio, no en Turso.

## Conexión

- Administración: `ssh pcmidi`.
- Servicio: `geomodi-libsql.service`, sqld 0.24.32.
- Datos: `/home/administrador/services/geomodi-libsql/data/geomodi.db`.
- Puerto interno: `127.0.0.1:8088`, sin exposición directa.
- Acceso HTTPS de la aplicación: `https://pcmidi.tailef6e62.ts.net`, mediante Tailscale Funnel, que reenvía a ese puerto interno.
- `geomodi-libsql-https.service` (Caddy) está inactivo. No es necesario habilitarlo ni configurar `db.geomodi.ai` para usar el acceso vigente.

Vercel necesita HTTPS; no mantiene un túnel SSH. El alias SSH `pcmidi` se usa para administración y acceso local opcional. El servidor debe permanecer encendido, con Internet y Tailscale activos.

## Variables

En `.env.local` y en Vercel **logitrack** (`prj_whyqDb9sDWCJ1VrBcY3cNxWr5pOJ`), Production y Preview:

```dotenv
DATABASE_URL=https://pcmidi.tailef6e62.ts.net
DATABASE_AUTH_TOKEN=<contenido de keys/app-rw.jwt del servidor>
DATABASE_READONLY_AUTH_TOKEN=<contenido de keys/portal-ro.jwt del servidor>
```

Las claves existentes se reutilizan sin rotarlas. Los tokens se cargan como sensibles en Vercel; nunca deben guardarse en Git ni mostrarse en logs. El portal usa exclusivamente el token RO, también en desarrollo. `@libsql/client` sigue siendo el cliente compatible con el servidor propio; no requiere una cuenta de Turso.

`node scripts/configure-pcmidi-database.mjs --apply` comprueba el proyecto y ambos tokens, configura estas variables en Vercel y actualiza `.env.local`, quitando de ese archivo las variables `TURSO_*` antiguas. No despliega ni modifica datos. Vercel aplica el entorno a despliegues nuevos. El código ya no lee variables `TURSO_*` y rechaza hosts de Turso. Las tres variables antiguas de Turso se retiraron de Vercel después de promover y verificar la versión nueva. No se eliminó la base histórica de la cuenta de Turso.

`DATABASE_URL_PROD`, `DATABASE_AUTH_TOKEN_PROD` y `DATABASE_READONLY_AUTH_TOKEN_PROD` son sobreescrituras opcionales para scripts; el destino de producción siempre debe ser el HTTPS de PC MIDI. Normalmente basta con las tres variables sin sufijo.

**`npm run dev` utiliza una base local aislada y no carga credenciales de `.env.local`.** Los scripts administrativos siguen pudiendo leer ese archivo y alcanzar la base operativa: comprobar su destino antes de ejecutarlos. Preview requiere una base independiente; la aplicación rechaza el host operativo en Preview. `scripts/pull-prod-db.mjs --yes` solo acepta `DATABASE_COPY_URL=file:ruta/a/copia.db` como destino descartable, y lee la fuente de PC MIDI con el token RO. Nunca borra una base remota. No ejecutar scripts de siembra para comprobar conectividad.

## Verificaciones

```powershell
npm run db:check
node scripts/check-database.mjs --production
ssh pcmidi 'systemctl --user status geomodi-libsql.service'
ssh pcmidi 'tailscale funnel status'
ssh pcmidi 'systemctl --user list-timers geomodi-libsql-backup.timer'
```

El diagnóstico verifica lectura autenticada, tablas presentes, rechazo de escritura con el token RO y HTTP 401 sin credenciales. La comprobación de permisos usa un nombre único y lo limpia si una credencial incorrectamente privilegiada permite crearlo. No modifica tablas de negocio.

Para acceder mediante SSH desde esta PC, dejar `npm run db:tunnel` abierto y usar `DATABASE_URL=http://127.0.0.1:18088` con las mismas credenciales. Los scripts con `--production` siguen usando el HTTPS de PC MIDI.

Antes de publicar: `npm test`, `npm run build` y `npm run deploy:production`. El último crea un despliegue sin dominios, verifica las rutas HMAC y dominios de ambas tiendas y recién después lo promueve. Redis conserva las aceptaciones de cross-selling.

## Respaldos y operación

`geomodi-libsql-backup.timer` hace una copia nocturna y conserva 14 días. Detiene brevemente el servicio, guarda datos y claves y vuelve a iniciarlo. El 29/10/2026 se verificaron servicio activo, 54 tablas, lectura por HTTPS con ambos tokens, rechazo de escritura RO, rechazo anónimo y respaldo del día. Falta una copia externa: los respaldos actuales residen en el mismo disco del servidor.

Los JWT vencen un año después de su creación. Planificar su renovación antes del vencimiento; no cambiar claves por una regresión del código o del proxy. Ante un fallo, comprobar servicio, espacio de disco, Funnel y conectividad antes de intervenir sobre los datos.

Las instrucciones antiguas de exportación desde Turso y acceso directo por Caddy quedaron reemplazadas por este procedimiento. No volver a importar el snapshot antiguo sobre la base actual.

## Publicación verificada del 29/10/2026

Código `f94ec00`, despliegue `dpl_CtszbRCqf5sheVuWbPAxDzPyNNEF`, promovido a `https://www.geomodi.ai` con `npm run deploy:production`. Se verificó que el dominio público resuelve a ese despliegue y al proyecto logitrack.

Validación: 167 pruebas aprobadas, compilación local y en Vercel aprobadas, ESLint de los archivos modificados aprobado. Prueba HTTPS con escritura y lectura, `lastInsertRowid`, token RO y rechazo anónimo aprobada; la tabla temporal de prueba se eliminó. Controles públicos de cross-selling aprobados antes y después de promover. Una consulta de reseñas con SKU de diagnóstico respondió HTTP 200 tanto en el despliegue privado como en el dominio público; ejecuta una lectura real de la base, sin cambios de datos.

Se retiraron `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` y `TURSO_READONLY_AUTH_TOKEN` del proyecto de Vercel y todas las variables `TURSO_*` de `.env.local`. Production y Preview conservan únicamente las tres variables nuevas de conexión para esta base. No se rotaron claves, repitieron autorizaciones ni cambiaron Redis, scripts de tienda o promociones.


## Copia cifrada fuera del servidor

En la PC Windows `DESKTOP-MG4UVAB`, la tarea programada `GeoModi-Respaldo-Externo` copia el último respaldo nocturno del servidor a `D:\Logística\_backup\offhost` todos los días a las 02:00, cuando la sesión del usuario está iniciada. Si la PC está apagada, el programador intenta ejecutar la tarea cuando vuelve a estar disponible. La tarea utiliza `scripts/backup-offhost-launch.ps1` y `scripts/backup-offhost.ps1`; para comprobar resultado y próxima ejecución, consultar `Get-ScheduledTaskInfo -TaskName GeoModi-Respaldo-Externo`.

El archivo se cifra con AES-256-GCM. La clave queda protegida por DPAPI para la cuenta Windows que ejecuta la tarea, en `backup-key.dpapi`, y no se guarda en Git. **Para descifrar se necesita esa cuenta y su perfil Windows**. Si se pierde la PC o el perfil, esa clave protegida no garantiza recuperación; hace falta una segunda copia y un procedimiento independiente de recuperación de la clave. La copia se encuentra fuera del servidor, en esta PC, pero no fuera del sitio. Por decisión del usuario no se utiliza Google Drive para respaldos. No copiar la clave sin una solución segura de custodia.

Comprobación manual desde la misma cuenta Windows:

```powershell
pwsh -NoProfile -File scripts/backup-offhost.ps1
pwsh -NoProfile -File scripts/verify-offhost.ps1 -BackupFile 'D:\Logística\_backup\offhost\<archivo>.gmbak'
```

La verificación autentica y descifra el archivo, extrae únicamente la base a un directorio temporal, ejecuta `PRAGMA integrity_check` y cuenta las tablas; no restaura sobre producción ni extrae las claves del servidor. El 19/11/2026 se validó una copia ejecutada por la tarea: integridad correcta, 54 tablas; un archivo de prueba alterado fue rechazado. La tarea conserva los archivos cifrados sin borrado automático; hay que controlar espacio y definir retención. Redis y sus aceptaciones no están incluidos y requieren su propio respaldo.

La primera verificación dejó una copia temporal en el directorio temporal de Windows por un archivo SQLite que permanecía abierto; se corrigió el cierre antes de la verificación exitosa. La carpeta temporal se eliminó el 19/11/2026 con un borrado normal y se verificó que ya no existe.


Comprobación operativa de solo lectura: `pwsh -NoProfile -File scripts/check-operational-health.ps1`. Revisa la web, servicio, antigüedad del respaldo del servidor y de la copia local, y resultado de la tarea programada. Devuelve código de error si falla un control; se comprobó con una URL local inaccesible. Procedimientos y límites en `docs/recuperacion.md`. Aún debe conectarse a un canal de alertas para que alguien se entere sin ejecutarla manualmente.
