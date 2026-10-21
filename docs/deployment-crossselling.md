# Publicación de GeoModi con cross-selling

## Causa de la regresión del 21/10/2026

Los cambios comerciales de PC MIDI se habían publicado desde `C:\Users\PC Midi\AppData\Local\Temp\logitrack-tn-20261016`, pero no estaban incorporados a la carpeta principal `D:\Logística`. Esta conservaba el storefront exclusivo para la demo y no incluía las excepciones HMAC de `/module` y `/report` en el proxy. Volver a desplegarla produjo 401 de Clerk y 403 de origen para PC MIDI. Además, su enlace local de Vercel correspondía a `logitrack-tan`.

Se incorporaron las rutas, el motor de producción por tienda, Redis, informes, medición, webhook y recursos del storefront desde la versión que funcionaba. No fue necesario cambiar credenciales ni autorizar nuevamente Tiendanube.

## Controles vigentes

1. `npm test` verifica el conjunto completo. Las pruebas de cross-selling comprueban firmas válidas e inválidas, separación de tiendas, aceptaciones, descuentos, Redis e informes. Las pruebas de release ejecutan el proxy con dobles de Next/Clerk para detectar el 401 antes del handler y comprobar que las APIs administrativas siguen protegidas.
2. `npm run build` ejecuta esas pruebas automáticamente mediante `prebuild`. `vercel.json` indica ese comando de compilación para los despliegues.
3. `npm run deploy:production` verifica el ID del proyecto público, ejecuta las pruebas y crea un despliegue de producción con `--skip-domain`. Antes de promoverlo comprueba que `/config`, `/module` y `/report` lleguen al control HMAC, que ambas tiendas acepten sus propios dominios, que un origen ajeno sea rechazado y que el script esté disponible. La URL de inspección se consulta con `vercel curl` y la sesión del CLI, sin desactivar la protección de Vercel ni usar claves de Tiendanube. Si falla, no promueve el despliegue.

Primera vinculación local: `vercel link --project logitrack`. No usar `logitrack-tan` como proyecto de despliegue.

Comprobación independiente, sólo lectura:

```powershell
node scripts/check-crossselling-deployment.mjs https://www.geomodi.ai
```

La comprobación no activa el módulo ni valida una compra: verifica la distribución, autorización de rutas y dominios. La aceptación de descuentos se cubre con pruebas del motor y, después de cambios comerciales, con una prueba de carrito.

Mantener estos archivos versionados en el repositorio principal. Publicar directamente con otro comando, eliminar los controles o usar otra copia del código puede eludir estas protecciones; no existe una garantía absoluta frente a ese tipo de cambios.

## Corrección publicada el 21/10/2026

- Despliegue: `dpl_4i17c8s6npqr3KQNgALfEnT2vJuX`, `https://logitrack-9e5x3tzab-lucio-tamborinis-projects.vercel.app`, promovido con el comando verificado a `www.geomodi.ai`.
- Verificación posterior sobre el dominio público: comprobación de distribución aprobada; consulta HMAC real de Mostrador a `/module` y `/report` con HTTP 200 para 78394. Módulo habilitado, promoción activa y script disponible.
- Validación: 116 pruebas aprobadas, lint de los controles sin errores y compilación de Vercel correcta. Se retiró la opción de Node `--experimental-default-type=module`, incompatible con el runtime actual de Vercel, y se agregó inspección de URLs protegidas mediante la sesión del CLI.
- Versión pública anterior: `dpl_BBqzi96vESFzgqRGNgBaR3mZja4S`. No promoverla para resolver este incidente: contiene la regresión del módulo.
- Mostrador y la tienda sólo requieren recargar las páginas. La promoción permanece activa; no es necesario volver a autorizar Tiendanube ni reiniciar Mostrador.
