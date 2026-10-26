# Usuarios de un espacio de trabajo

Desde GestiÃ³n de Usuarios, un propietario o administrador puede agregar una cuenta por email y elegir `admin` o `user`. Si la cuenta ya existe, conserva su identidad y puede ingresar con su sesiÃ³n habitual. Si todavÃ­a no se vinculÃ³ a GeoModi, el acceso queda pendiente hasta que inicie sesiÃ³n o se registre con ese email.

Si la cuenta pertenece a otros espacios, el alta responde con conflicto. Solo el administrador global ve la opciÃ³n Â«Reasignar a este espacioÂ». La confirmaciÃ³n informa que perderÃ¡ acceso a los espacios anteriores, cuyos datos se conservan. No se reasignan administradores globales ni la propia cuenta; el rol de propietario del destino se conserva.

`POST /api/auth/users` acepta `{ email, role, reassign?: true }`. El conflicto entre espacios devuelve HTTP 409 con `code: OTHER_WORKSPACE` y `canReassign`. Un intento de reasignaciÃ³n sin permisos devuelve HTTP 403. La respuesta correcta incluye `isPending`, `reassigned` y `updated`. La modificaciÃ³n de membresÃ­as y su auditorÃ­a se ejecutan en una transacciÃ³n. No hay cachÃ© de membresÃ­as entre solicitudes: la siguiente resoluciÃ³n de la sesiÃ³n consulta el espacio actual en la base.

## AsignaciÃ³n de PC MIDI del 26/10/2026

- Espacio de destino: GeoModi, ID 1, slug `legacy`. Camilo (`camilopcmidi@gmail.com`, ID 11) conserva su membresÃ­a `owner` y su condiciÃ³n de administrador global.
- Lucio (`luciopcmidi@gmail.com`, ID 1) quedÃ³ como `admin` en el destino. Se quitaron sus membresÃ­as de los espacios 2, 3 y 4, sin modificar esos espacios ni sus datos.
- Guillermo (`guillermo@pcmidicenter.com`, ID 13) pasÃ³ de `user` a `admin` en el destino. Su identidad local sigue pendiente de vinculaciÃ³n mediante inicio de sesiÃ³n o registro.
- AplicaciÃ³n y verificaciÃ³n: `node scripts/assign-pcmidi-workspace.mjs --apply`. Sin `--apply`, el script solo consulta el estado. Exige credenciales explÃ­citas de producciÃ³n y comprueba el propietario y el destino antes de actuar.
- ValidaciÃ³n: 148 pruebas aprobadas, incluida la resoluciÃ³n de una sesiÃ³n existente despuÃ©s de la reasignaciÃ³n y la reversiÃ³n si falla la auditorÃ­a; compilaciÃ³n y lint de los archivos modificados aprobados.
- Publicado con `npm run deploy:production`: `dpl_7BDmnWVSTFj8QzGJzWx8F65gQ3gA`, cÃ³digo `6a2e472`, en `https://www.geomodi.ai`. Controles previos y posteriores de rutas HMAC, dominios de ambas tiendas y script aprobados. `/api/auth/users` y `/api/auth/me` siguen respondiendo 401 sin sesiÃ³n.


## Corrección del acceso del 26/10/2026

La primera verificación usó las variables locales `TURSO_DATABASE_URL_PROD` y `TURSO_AUTH_TOKEN_PROD`, que conservan un snapshot antiguo. No constituía evidencia de la asignación en la base pública. Se corrigió el script para usar el libSQL actual por SSH y se verificó y aplicó allí la reasignación: Lucio conservaba las membresías 2, 3 y 4 además de la 1; ahora solo conserva la 1 como administrador. Guillermo ya tenía el rol admin en la base actual y lo conserva. Camilo sigue owner y administrador global.

El bloqueo de acceso coincidió con agotamientos de tiempo en varias APIs. El servicio libSQL consumía unos 24 GiB y ni `SELECT 1` por HTTP local respondía en 10 segundos. Los listados administrativos cruzaban envíos, lotes y auditorías en la misma consulta, generando productos cartesianos. Se reemplazaron por conteos y agregaciones independientes, conservando sus interfaces; también se corrigió la suma de paquetes de usuarios, antes multiplicada por cada entrada de auditoría. Se reinició únicamente `geomodi-libsql.service`, sin cambiar credenciales ni datos operativos. Después, la memoria bajó a unos 162 MiB y el navegador de Lucio mostró el Dashboard con rol admin y datos de GeoModi.

La carga de `/api/auth/me` tiene ahora un límite de 20 segundos y presenta el error recuperable existente en caso de demora. Validación: 149 pruebas aprobadas, con regresión de conteos para miles de envíos, varios miembros y entradas de actividad.

Publicación correctiva: `dpl_BJKU31X415AYdug3Ucc9ZPH7hT2o`, código `a187bd0`, promovida con `npm run deploy:production`. Controles públicos posteriores de cross-selling aprobados. Se recargó la pestaña de Lucio después de publicar y se verificó visualmente el Dashboard con su email y rol admin; consulta de solo lectura al libSQL actual confirmó una única membresía para cada cuenta en el espacio 1. Las consultas administrativas corregidas se ejecutaron también sobre la base actual en menos de 1 ms cada una.
