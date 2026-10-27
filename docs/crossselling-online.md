# Cross-selling compartido con Mostrador

Esta etapa prepara la recepción de reglas y el motor compartido. Las reglas comerciales permanecen desactivadas. Existe además una sonda temporal de $1, exclusivamente para la demo 7570182 y un carrito seleccionado por un administrador.

- API de publicación: `GET/PUT /api/cross-selling/config?storeId=<id>`, autenticada mediante HMAC por tienda. Configurar `CROSS_SELLING_PUBLISH_KEYS` en servidor; ver `.env.example`.
- Persistencia: tabla independiente `crossselling_config`, creada al primer uso. Guarda la configuración interna, el catálogo y el diagnóstico. No toca el esquema de pedidos o logística.
- Motor: archivos distribuidos desde `Mostrador/shared` en `src/lib/crossselling/engine`, con hashes en `manifest.json`. No editarlos directamente; actualizar desde Mostrador.
- El cliente TN puede consultar catálogo/promociones y administrar promociones/callbacks. Ninguna publicación ejecuta operaciones de escritura en Tiendanube.
- `ready` y `enabled` permanecen en `false` hasta resolver y validar la integración real.

Diagnóstico de sólo lectura, sin imprimir credenciales:

```powershell
node --env-file=.env.local scripts/probar-crossselling.mjs --store=7570182 --production --inspect-pending
```

`--production` usa `TURSO_DATABASE_URL_PROD` y `TURSO_AUTH_TOKEN_PROD`. Esas credenciales locales conservan datos antiguos y no permiten diagnosticar la autorización actual del servidor. El diagnóstico no vincula sesiones vencidas.

Validación local: `npm test` y `npm run build`. La especificación, la configuración completa y la lista de trabajo pendiente están en `D:\Mostrador\docs\crossselling-online.md`.
Pendientes: callback HTTP seguro y probado, identidad de carrito, persistencia de aceptaciones, módulo visual en tienda, refresco de catálogo y métricas de pedidos. No se debe activar el servicio con sólo el evaluador puro.

Antes de desplegar, verificar el proyecto: el enlace local de Vercel apunta a `logitrack-tan`, mientras la app pública `geomodi.ai` pertenece a `logitrack`.

Actualización: se publicó una corrección aislada de OAuth/navegación y un diagnóstico autenticado, desde un checkout limpio basado en la misma revisión de producción `6281210`. Despliegue `dpl_Bi7bNSYkFReXC3Ws8m9qzu4dkDiA`, en `www.geomodi.ai`. No incluye el motor ni el widget de cross-selling, ni los cambios pendientes de logística/finanzas. El despliegue anterior es `dpl_FzqzBaAVCy7mSjuiq4VdRzymgyfM` para reversión.

El diagnóstico real está en `/api/admin/tiendanube/cross-selling/status?storeId=7570182`, requiere sesión de administrador del workspace y sólo devuelve resultados de acceso y scopes de una conexión de ese workspace. Las credenciales locales de base no son evidencia suficiente sobre autorizaciones nuevas guardadas en el servidor.

Actualización 16/10/2026: demo vinculada al workspace 2; catálogo y promociones responden correctamente. Scopes efectivos incluyen `read_discounts`, `write_discounts`, `write_scripts`. No hace falta repetir OAuth. Promoción de prueba `3ad5cdaf-facf-4f1c-a074-9c3f30a56c12`, callback registrado sólo para esta tienda. Panel autenticado `/cross-selling-test`, API admin `/api/admin/tiendanube/cross-selling/probe`. La URL del callback incluye un autenticador derivado de clave de servidor y no se devuelve al navegador. Esto es una sonda de demo, no sustituye el control IP/WAF requerido antes de producción. Guarda sólo variantes, importes, cantidades y comandos, sin datos de cliente. Máximo 100 eventos y expiración de beneficio a dos horas.

Prueba básica aprobada: sin aceptación no hubo descuento de la app; con aceptación, carrito y checkout mostraron subtotal $224.332,20, descuento $1 y total $224.331,20. Al quitar el principal, el callback retiró el descuento y el total quedó $61.346,40. Se desactivó la promoción (`active:false`) y la aceptación (`enabled:false`) al terminar. No se creó un pedido ni un pago. Evidencias en `D:\Mostrador\docs\evidence`.

La lectura de Turso en el callback dio 475–1229 ms; una lectura HTTP directa con límite de 600 ms también venció. Se retiraron esas variantes del camino crítico. La sonda final utiliza claims compactos firmados, con vencimiento y limitados a un solo carrito: evaluación de 0–1 ms sin base, registros posteriores con `after()`. La firma se prueba contra manipulación y otra clave. Esta sonda no sustituye la persistencia e identidad de aceptaciones comerciales ni la autenticación IP/WAF que TN exige para producción.

Versión que pasó la prueba real: `dpl_8KoNmpdF2Q1Sqw5h8pjDpdJDH6NM`. La última versión de mantenimiento agrupa la firma en un módulo testeable y conserva selección del panel ante errores; se registra su despliegue abajo. Fuente completa: 63 tests aprobados; checkout aislado: 45 aprobados. Lint sin errores, con un warning anterior de imágenes en `CarrierPortalClient.js`.

Pendiente comercial: módulo al agregar y carrito, aceptaciones verificables, evaluación de baja latencia, métricas, confirmación de compras y matriz completa de transferencia/cupones/redondeos. No volver a solicitar OAuth: el acceso ya está resuelto.

Despliegue final de mantenimiento: `dpl_2m81wKohyMqjwBMZmNoUiwrYXzkF`, `https://logitrack-8pp4ts8e8-lucio-tamborinis-projects.vercel.app`, promovido al proyecto `logitrack`. Se conserva el checkout aislado para revisar o continuar; las modificaciones ajenas de la carpeta principal no se incluyeron.
