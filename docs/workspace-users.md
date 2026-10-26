# Usuarios de un espacio de trabajo

Desde Gesti√≥n de Usuarios, un propietario o administrador puede agregar una cuenta por email y elegir `admin` o `user`. Si la cuenta ya existe, conserva su identidad y puede ingresar con su sesi√≥n habitual. Si todav√≠a no se vincul√≥ a GeoModi, el acceso queda pendiente hasta que inicie sesi√≥n o se registre con ese email.

Si la cuenta pertenece a otros espacios, el alta responde con conflicto. Solo el administrador global ve la opci√≥n ¬´Reasignar a este espacio¬ª. La confirmaci√≥n informa que perder√° acceso a los espacios anteriores, cuyos datos se conservan. No se reasignan administradores globales ni la propia cuenta; el rol de propietario del destino se conserva.

`POST /api/auth/users` acepta `{ email, role, reassign?: true }`. El conflicto entre espacios devuelve HTTP 409 con `code: OTHER_WORKSPACE` y `canReassign`. Un intento de reasignaci√≥n sin permisos devuelve HTTP 403. La respuesta correcta incluye `isPending`, `reassigned` y `updated`. La modificaci√≥n de membres√≠as y su auditor√≠a se ejecutan en una transacci√≥n. No hay cach√© de membres√≠as entre solicitudes: la siguiente resoluci√≥n de la sesi√≥n consulta el espacio actual en la base.

## Asignaci√≥n de PC MIDI del 26/10/2026

- Espacio de destino: GeoModi, ID 1, slug `legacy`. Camilo (`camilopcmidi@gmail.com`, ID 11) conserva su membres√≠a `owner` y su condici√≥n de administrador global.
- Lucio (`luciopcmidi@gmail.com`, ID 1) qued√≥ como `admin` en el destino. Se quitaron sus membres√≠as de los espacios 2, 3 y 4, sin modificar esos espacios ni sus datos.
- Guillermo (`guillermo@pcmidicenter.com`, ID 13) pas√≥ de `user` a `admin` en el destino. Su identidad local sigue pendiente de vinculaci√≥n mediante inicio de sesi√≥n o registro.
- Aplicaci√≥n y verificaci√≥n: `node scripts/assign-pcmidi-workspace.mjs --apply`. Sin `--apply`, el script solo consulta el estado. Exige credenciales expl√≠citas de producci√≥n y comprueba el propietario y el destino antes de actuar.
- Validaci√≥n: 148 pruebas aprobadas, incluida la resoluci√≥n de una sesi√≥n existente despu√©s de la reasignaci√≥n y la reversi√≥n si falla la auditor√≠a; compilaci√≥n y lint de los archivos modificados aprobados.
- Publicado con `npm run deploy:production`: `dpl_7BDmnWVSTFj8QzGJzWx8F65gQ3gA`, c√≥digo `6a2e472`, en `https://www.geomodi.ai`. Controles previos y posteriores de rutas HMAC, dominios de ambas tiendas y script aprobados. `/api/auth/users` y `/api/auth/me` siguen respondiendo 401 sin sesi√≥n.


## CorrecciÛn del acceso del 26/10/2026

La primera verificaciÛn usÛ las variables locales `TURSO_DATABASE_URL_PROD` y `TURSO_AUTH_TOKEN_PROD`, que conservan un snapshot antiguo. No constituÌa evidencia de la asignaciÛn en la base p˙blica. Se corrigiÛ el script para usar el libSQL actual por SSH y se verificÛ y aplicÛ allÌ la reasignaciÛn: Lucio conservaba las membresÌas 2, 3 y 4 adem·s de la 1; ahora solo conserva la 1 como administrador. Guillermo ya tenÌa el rol admin en la base actual y lo conserva. Camilo sigue owner y administrador global.

El bloqueo de acceso coincidiÛ con agotamientos de tiempo en varias APIs. El servicio libSQL consumÌa unos 24 GiB y ni `SELECT 1` por HTTP local respondÌa en 10 segundos. Los listados administrativos cruzaban envÌos, lotes y auditorÌas en la misma consulta, generando productos cartesianos. Se reemplazaron por conteos y agregaciones independientes, conservando sus interfaces; tambiÈn se corrigiÛ la suma de paquetes de usuarios, antes multiplicada por cada entrada de auditorÌa. Se reiniciÛ ˙nicamente `geomodi-libsql.service`, sin cambiar credenciales ni datos operativos. DespuÈs, la memoria bajÛ a unos 162 MiB y el navegador de Lucio mostrÛ el Dashboard con rol admin y datos de GeoModi.

La carga de `/api/auth/me` tiene ahora un lÌmite de 20 segundos y presenta el error recuperable existente en caso de demora. ValidaciÛn: 149 pruebas aprobadas, con regresiÛn de conteos para miles de envÌos, varios miembros y entradas de actividad.
