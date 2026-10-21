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
