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

## Simplificación visual publicada el 22/10/2026

- Despliegue final: `dpl_3xUXp6BC8MNbxjhmtmG2AcBZb2Q6`, `https://logitrack-kfclwkhzg-lucio-tamborinis-projects.vercel.app`, promovido a `www.geomodi.ai` mediante `npm run deploy:production`. Código en `4e44bb8` y `23b276b`.
- Carrito y ventana: resumen del principal antes de «Completá tu equipo», condición una vez por grupo y sugerencias agrupadas por línea principal. Página de producto: condición breve sin afirmar que ya está en el carrito. Se conservan nombres completos y variantes; cada sugerencia muestra precio final, ahorro y porcentaje, sin precio tachado. No se incorporaron «HOY» ni emojis.
- El tema elimina productos por AJAX sin emitir `productAddedToCart`. El observador existente ahora retira los grupos cuyo principal ya no tiene una línea visible, aunque `LS.cart` aún conserve datos anteriores. Se mantiene la presentación de descuentos confirmados por Tiendanube.
- Validación: 124 pruebas aprobadas, compilación local y de Vercel correctas. Revisión visual en escritorio y celular del carrito, ventana, página de producto y carrito lateral con datos controlados y estilos del tema; nombres largos, varios principales, ofertas sin imagen, variantes y agregados. Dos pruebas nuevas cubren la retirada del principal por AJAX y el bloque vacío.
- Prueba pública en PC MIDI, sin comprar: LM-103 y soporte agregados desde «Agregar los dos con descuento»; Tiendanube confirmó `-$3.464,76` y total `$338.690,07`. Al quitar el piano, sin recargar, desaparecieron sus sugerencias y el descuento; el soporte quedó en `$34.647,60`. Se vaciaron los carritos temporales de Chrome y del navegador integrado.
- Verificación posterior: rutas HMAC, dominios separados de ambas tiendas y script público aprobados; el archivo servido coincide exactamente con la fuente (SHA-256 `1890197cebc71b7b853c489d9fc3092eabd24ec5b20569ad61379dbbe355bcc5`). Tiendanube carga el script de Partners después de la primera interacción; no se cambiaron instalación, credenciales, promoción ni reglas.
- Captura del carrito público: [Completá tu equipo en escritorio](evidence/completa-tu-equipo-ux-desktop-20261022.png). La ventana y el carrito lateral se validaron localmente; el agregado normal del tema Amazonas redirige al carrito.

## Conciliación de ventas online publicada el 22/10/2026

- Despliegue: `dpl_Gb56LCmGG2D6JMxRMxAM5u6Khtkw`, `https://logitrack-6xvy1n6w5-lucio-tamborinis-projects.vercel.app`, promovido mediante `npm run deploy:production`. Código en `e6acd25`.
- Causa: el webhook respondía éxito aunque fallara el registro del informe, y la sincronización manual sólo actualizaba logística. Faltaban #11025 y #11026 del 21/10.
- El informe concilia antes de responder, como máximo cada 5 minutos: pedidos modificados en Tiendanube desde la última revisión (margen de 10 minutos, desde el 19/10), sin filtrar estado. Cuentan pagos `paid` (Recibido) no cancelados, agrupados por fecha de creación; las transferencias confirmadas tarde entran al día en que se creó el pedido.
- Verificación con la conexión firmada de Mostrador: 21/10 = 4 ventas, `$2.319.230,46`, igual que Tiendanube; 20/10 = 5 ventas, `$5.110.099,18`.
