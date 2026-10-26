# Usuarios de un espacio de trabajo

Desde Gestión de Usuarios, un propietario o administrador puede agregar una cuenta por email y elegir `admin` o `user`. Si la cuenta ya existe, conserva su identidad y puede ingresar con su sesión habitual. Si todavía no se vinculó a GeoModi, el acceso queda pendiente hasta que inicie sesión o se registre con ese email.

Si la cuenta pertenece a otros espacios, el alta responde con conflicto. Solo el administrador global ve la opción «Reasignar a este espacio». La confirmación informa que perderá acceso a los espacios anteriores, cuyos datos se conservan. No se reasignan administradores globales ni la propia cuenta; el rol de propietario del destino se conserva.

`POST /api/auth/users` acepta `{ email, role, reassign?: true }`. El conflicto entre espacios devuelve HTTP 409 con `code: OTHER_WORKSPACE` y `canReassign`. Un intento de reasignación sin permisos devuelve HTTP 403. La respuesta correcta incluye `isPending`, `reassigned` y `updated`. La modificación de membresías y su auditoría se ejecutan en una transacción. No hay caché de membresías entre solicitudes: la siguiente resolución de la sesión consulta el espacio actual en la base.

## Asignación de PC MIDI del 26/10/2026

- Espacio de destino: GeoModi, ID 1, slug `legacy`. Camilo (`camilopcmidi@gmail.com`, ID 11) conserva su membresía `owner` y su condición de administrador global.
- Lucio (`luciopcmidi@gmail.com`, ID 1) quedó como `admin` en el destino. Se quitaron sus membresías de los espacios 2, 3 y 4, sin modificar esos espacios ni sus datos.
- Guillermo (`guillermo@pcmidicenter.com`, ID 13) pasó de `user` a `admin` en el destino. Su identidad local sigue pendiente de vinculación mediante inicio de sesión o registro.
- Aplicación y verificación: `node scripts/assign-pcmidi-workspace.mjs --apply`. Sin `--apply`, el script solo consulta el estado. Exige credenciales explícitas de producción y comprueba el propietario y el destino antes de actuar.
- Validación: 148 pruebas aprobadas, incluida la resolución de una sesión existente después de la reasignación y la reversión si falla la auditoría; compilación y lint de los archivos modificados aprobados.
- Publicado con `npm run deploy:production`: `dpl_7BDmnWVSTFj8QzGJzWx8F65gQ3gA`, código `6a2e472`, en `https://www.geomodi.ai`. Controles previos y posteriores de rutas HMAC, dominios de ambas tiendas y script aprobados. `/api/auth/users` y `/api/auth/me` siguen respondiendo 401 sin sesión.
