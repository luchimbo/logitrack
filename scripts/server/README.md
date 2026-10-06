# Base GeoModi en `pcmidi`

Se instaló `sqld` 0.24.32 en `/home/administrador/services/geomodi-libsql` como servicio de usuario `geomodi-libsql.service`. Escucha **solo** en `127.0.0.1:8088`. El servicio y `geomodi-libsql-backup.timer` quedan habilitados tras reinicios; el usuario ya tiene `linger` activado.

Los tokens JWT de lectura/escritura y solo lectura están en `keys/app-rw.jwt` y `keys/portal-ro.jwt` dentro del servidor, con permisos `0600`. La clave privada no debe copiarse a Vercel. Los tokens actuales vencen un año después de su creación.

Comprobaciones realizadas:

- El cliente `@libsql/client` pudo escribir y leer por el puerto local y por un túnel HTTPS temporal.
- El token de solo lectura rechazó escrituras y el servidor rechazó consultas sin token.
- Un SQLite de prueba se importó al iniciar `sqld` y se pudo consultar.
- La copia nocturna detiene el servicio, guarda el directorio completo `data` junto a `keys` y lo vuelve a iniciar. Se conservan 14 días. **Esta copia está en el mismo disco; falta una copia externa.**

## Exportación pendiente

En un equipo con Turso CLI y sesión autorizada:

```bash
turso db export logitrack --output-file logitrack.db
```

La exportación genera un snapshot SQLite que puede no contener las últimas transacciones. Hay que validar integridad y conteos, y sincronizar cualquier cambio posterior, antes de cambiar la app. Si Turso no permite exportar por la cuota, habrá que restaurar temporalmente el acceso o esperar la renovación de la cuota.

Copiar el archivo al servidor, sin ponerlo en el repositorio:

```bash
scp logitrack.db pcmidi:services/geomodi-libsql/incoming/
```

**No reemplazar todavía** `data/geomodi.db`: primero se probará la exportación en una instancia separada y se compararán esquema y conteos. Después se hará un corte controlado con respaldo y opción de volver a Turso.

## Vercel

El proyecto de producción de `www.geomodi.ai` es **`logitrack`**. El directorio local está vinculado a otro proyecto, `logitrack-tan`; no usar `vercel env add` desde la raíz del repositorio sin verificar el proyecto.

Cuando exista un hostname HTTPS estable para la base y los datos estén migrados, en **logitrack → Settings → Environment Variables → Production** se cambiarán:

- `TURSO_DATABASE_URL`: URL HTTPS del servidor libSQL.
- `TURSO_AUTH_TOKEN`: contenido de `keys/app-rw.jwt`.
- `TURSO_READONLY_AUTH_TOKEN`: contenido de `keys/portal-ro.jwt`.

Los tokens deben cargarse como variables sensibles. Vercel aplica cambios de entorno solo a despliegues nuevos, por lo que luego hace falta desplegar y verificar `/api/auth/me` y los flujos de lectura/escritura. Mantener los valores anteriores para poder revertir el corte.

## Estado y respaldo

```bash
ssh pcmidi 'systemctl --user status geomodi-libsql.service'
ssh pcmidi 'systemctl --user list-timers geomodi-libsql-backup.timer'
ssh pcmidi 'systemctl --user start geomodi-libsql-backup.service'
```

## HTTPS directo sin Cloudflare

El binario oficial de Caddy 2.11.4, `Caddyfile` y `geomodi-libsql-https.service` están instalados en el servidor. El servicio HTTPS está **deshabilitado y detenido** hasta completar la red. Se validó la configuración y se probó el proxy con un certificado local temporal; la prueba se detuvo y eliminó.

Valores necesarios:

1. En Hostinger, crear un registro **A** `db.geomodi.ai` → `186.108.111.3` (host `db`, TTL predeterminado). Si ya existe, corregirlo en vez de duplicarlo.
2. Confirmar que la IP WAN/Internet del Archer C5 sea `186.108.111.3`. Si es distinta o está en rango privado/CGNAT, el reenvío directo no funcionará: resolver la IP pública con el proveedor o usar un túnel estable.
3. Reservar `192.168.1.100` para el servidor en DHCP del router, ya que actualmente obtiene esa dirección dinámicamente.
4. En NAT/Virtual Servers del Archer C5, reenviar **TCP externo 443** a `192.168.1.100`, **TCP interno 8443**. Solo este puerto debe quedar publicado; `8088` permanece local.
5. En el servidor, abrir únicamente el puerto interno con `sudo ufw allow 8443/tcp` si UFW está activo. El usuario `administrador` no tiene sudo sin contraseña, por lo que esto debe ejecutarlo el propietario del servidor. No compartir la contraseña.

Caddy usa el desafío TLS-ALPN en el puerto público 443 para obtener el certificado. No necesita publicar el puerto 80. Después de completar los cinco puntos:

```bash
ssh pcmidi 'systemctl --user enable --now geomodi-libsql-https.service'
ssh pcmidi 'systemctl --user status geomodi-libsql-https.service'
```

Comprobar desde una red externa `https://db.geomodi.ai/v2/pipeline`: sin token debe responder `401`, lo cual confirma que HTTPS y el proxy funcionan. La prueba completa con token debe ejecutarse sin mostrarlo en logs o consola compartida. Cuando la base migrada esté validada, usar `https://db.geomodi.ai` en Vercel y desplegar nuevamente. Si cambia la IP pública, actualizar el registro A y revisar si conviene un servicio DDNS.
