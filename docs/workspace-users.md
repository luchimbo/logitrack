# Usuarios de un espacio de trabajo

Desde Gestión de Usuarios, un propietario o administrador puede agregar una cuenta por email y elegir `admin` o `user`. Si la cuenta ya existe, conserva su identidad y puede ingresar con su sesión habitual. Si todavía no se vinculó a GeoModi, el acceso queda pendiente hasta que inicie sesión o se registre con ese email.

## Asignación y correo de acceso

La sección se llama **Espacio y miembros**. Muestra el destino antes del formulario; el administrador global puede seleccionar otro espacio sin cambiar su propia sesión. Los demás administradores solo gestionan el suyo. El selector identifica espacios con el propietario o slug y su ID para distinguir nombres repetidos.

**Asignar y enviar acceso** guarda la membresía y después solicita a Clerk el correo de invitación de GeoModi. Se puede desmarcar el envío para asignar sin notificar. La identidad se consulta en Clerk para elegir inicio de sesión o registro; una cuenta local pendiente no implica necesariamente que la persona no se haya registrado en Clerk. El enlace pasa por `/workspace-access`, que separa ambos recorridos sin otorgar permisos. Las invitaciones caducan a los siete días; la membresía conserva sus permisos independientemente del correo.

Cada miembro tiene **Enviar acceso / Reenviar acceso**, estado del envío y fecha del último correo aceptado por el proveedor. Hay un minuto de espera entre intentos. Un fallo de envío se muestra por separado y no revierte la asignación. `sent` significa que Clerk aceptó la solicitud; no prueba recepción en la bandeja de entrada. No se usan correos personales ni se agregan credenciales de otro proveedor.

`GET /api/auth/users?workspaceId=...` devuelve miembros, espacio de destino y, solo para el administrador global, los espacios disponibles. `POST` acepta `workspaceId`, `sendEmail: true` y la confirmación `reassign: true` cuando corresponda. Para reenviar sin modificar la membresía: `{ action: 'sendAccess', workspaceId, email }`. `PATCH` acepta también `workspaceId`. Todas las operaciones validan los permisos sobre el destino. El estado del correo se conserva en `workspace_access_emails`; las URLs y tickets de invitación no se devuelven ni registran en auditoría.

Si la cuenta pertenece a otros espacios, el alta responde con conflicto. Solo el administrador global ve la opción «Reasignar a este espacio». La confirmación informa que perderá acceso a los espacios anteriores, cuyos datos se conservan. No se reasignan administradores globales ni la propia cuenta; el rol de propietario del destino se conserva.

`POST /api/auth/users` acepta `{ email, role, reassign?: true }`. El conflicto entre espacios devuelve HTTP 409 con `code: OTHER_WORKSPACE` y `canReassign`. Un intento de reasignación sin permisos devuelve HTTP 403. La respuesta correcta incluye `isPending`, `reassigned` y `updated`. La modificación de membresías y su auditoría se ejecutan en una transacción. No hay caché de membresías entre solicitudes: la siguiente resolución de la sesión consulta el espacio actual en la base.

## Asignación de PC MIDI del 26/10/2026

- Espacio de destino: GeoModi, ID 1, slug `legacy`. Camilo (`camilopcmidi@gmail.com`, ID 11) conserva su membresía `owner` y su condición de administrador global.

- Lucio (`luciopcmidi@gmail.com`, ID 1) quedó como `admin` en el destino. Se quitaron sus membresías de los espacios 2, 3 y 4, sin modificar esos espacios ni sus datos.

- Guillermo (`guillermo@pcmidicenter.com`, ID 13) pasó de `user` a `admin` en el destino. Su identidad local sigue pendiente de vinculación mediante inicio de sesión o registro.

- Aplicación y verificación: `node scripts/assign-pcmidi-workspace.mjs --apply`. Sin `--apply`, el script solo consulta el estado. Exige credenciales explícitas de producción y comprueba el propietario y el destino antes de actuar.

- Validación: 148 pruebas aprobadas, incluida la resolución de una sesión existente después de la reasignación y la reversión si falla la auditoría; compilación y lint de los archivos modificados aprobados.

- Publicado con `npm run deploy:production`: `dpl_7BDmnWVSTFj8QzGJzWx8F65gQ3gA`, código `6a2e472`, en `https://www.geomodi.ai`. Controles previos y posteriores de rutas HMAC, dominios de ambas tiendas y script aprobados. `/api/auth/users` y `/api/auth/me` siguen respondiendo 401 sin sesión.

## Corrección del acceso del 26/10/2026

La primera verificación usó las variables locales `TURSO_DATABASE_URL_PROD` y `TURSO_AUTH_TOKEN_PROD`, que conservan un snapshot antiguo. No constituía evidencia de la asignación en la base pública. Se corrigió el script para usar el libSQL actual por SSH y se verificó y aplicó allí la reasignación: Lucio conservaba las membresías 2, 3 y 4 además de la 1; ahora solo conserva la 1 como administrador. Guillermo ya tenía el rol admin en la base actual y lo conserva. Camilo sigue owner y administrador global.

El bloqueo de acceso coincidió con agotamientos de tiempo en varias APIs. El servicio libSQL consumía unos 24 GiB y ni `SELECT 1` por HTTP local respondía en 10 segundos. Los listados administrativos cruzaban envíos, lotes y auditorías en la misma consulta, generando productos cartesianos. Se reemplazaron por conteos y agregaciones independientes, conservando sus interfaces; también se corrigió la suma de paquetes de usuarios, antes multiplicada por cada entrada de auditoría. Se reinició únicamente `geomodi-libsql.service`, sin cambiar credenciales ni datos operativos. Después, la memoria bajó a unos 162 MiB y el navegador de Lucio mostró el Dashboard con rol admin y datos de GeoModi.

La carga de `/api/auth/me` tiene ahora un límite de 20 segundos y presenta el error recuperable existente en caso de demora. Validación: 149 pruebas aprobadas, con regresión de conteos para miles de envíos, varios miembros y entradas de actividad.

Publicación correctiva: `dpl_BJKU31X415AYdug3Ucc9ZPH7hT2o`, código `a187bd0`, promovida con `npm run deploy:production`. Controles públicos posteriores de cross-selling aprobados. Se recargó la pestaña de Lucio después de publicar y se verificó visualmente el Dashboard con su email y rol admin; consulta de solo lectura al libSQL actual confirmó una única membresía para cada cuenta en el espacio 1. Las consultas administrativas corregidas se ejecutaron también sobre la base actual en menos de 1 ms cada una.
