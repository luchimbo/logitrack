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

## Informe sin pedidos nuevos (23/10/2026)

- Corregido el 404 de Tiendanube cuando el listado informa Last page is 0: listOrders devuelve una lista vacía sólo para esa respuesta de paginación; otros errores se propagan.
- Commit ac76396. 143 pruebas aprobadas. Publicado mediante deploy:production: dpl_ESp5argrRpZtT9VHGDmJVGrikmuc.
- Consulta HMAC real de Mostrador para 23/10: respuesta correcta, conciliación completada con 0 pedidos nuevos y 0 ventas del día.


## Error 502 del rango semanal (23/10/2026)

- Reproducido 502 para 17–23/10 mientras hoy y 22–23 respondían bien. El handler ocultaba la causa y no la registraba.
- Agregado diagnóstico interno; desplegado dpl_CT2Vu3mE6f4KCHycWETUDqaKc4gt con controles aprobados. 143 pruebas aprobadas.
- Tras publicar, cuatro consultas firmadas consecutivas del rango semanal respondieron correctamente: 21 pedidos, total 10275124.97. No se confirmó la causa original; no se cambió el cálculo del informe.


## Revisión de producción del 28/10/2026

- Producción apunta a dpl_AnyxVni2kzUSTcQaTpXTZ4eDvUB2, creado el 27/10 a las 16:45 de Argentina.
- La consulta de logs de producción sin filtro de rama, solicitando siete días, devolvió dos solicitudes a /api/cross-selling/report con HTTP 200 y ninguna respuesta 5xx. No expone los rangos consultados; esto no demuestra que el rango semanal haya sido probado ni permite determinar la causa del 502 del 23/10.
- No fue posible repetir una consulta HMAC: las claves de publicación no están disponibles en el entorno local y la descarga del entorno de producción entrega ese valor vacío. No se cambiaron claves.
- La configuración efectiva del proyecto confirma cron habilitado y dos definiciones: mercadolibre-sync a las 11:00 UTC (08:00 Argentina) y mercadolibre-upkeep a las 11:20 UTC (08:20 Argentina). CRON_SECRET figura configurado en Production.
- Las búsquedas por ambas rutas y por nombre no devolvieron ejecuciones en el historial accesible. La ausencia de registros no prueba ausencia de ejecución ni éxito. Queda pendiente obtener el historial del programador y resultados por cuenta.
- La metadata del despliegue indica commit 3964fe2 y gitDirty=1; HEAD local es 49cea81. El despliegue ya incluye las dos definiciones de cron, pero la metadata no permite asegurar qué cambios locales de la separación de procesos contiene.
- Ambos diagnósticos permanecen abiertos. No se publicó ni se ejecutó manualmente una sincronización; una ejecución manual tampoco demostraría que el programador funcionó.

### Comprobación desde Mostrador y panel de Vercel · 28/10/2026

- Se abrió el Mostrador de producción en https://mostrador.cafishia.com/admin#informes con su conexión existente. El período personalizado 17/10/2026–23/10/2026 y canal Online terminó correctamente: 22 ventas, $10.610.717,20; cross-selling $48.587,53 y descuento $5.398,61. El informe mensual también cargó. Las solicitudes contemporáneas del informe aparecen en Vercel con HTTP 200. No se reprodujo el 502; su causa original sigue desconocida. Los totales actuales no deben confundirse con la foto del 23/10: la conciliación puede incorporar pagos confirmados posteriormente.
- El panel de Cron Jobs confirma ambos procesos habilitados. Muestra que el plan Hobby usa una ventana flexible de una hora: 08:00–09:00 y 08:20–09:20 de Argentina, respectivamente, en lugar de garantizar el minuto exacto.
- View Logs lleva al historial de solicitudes/runtime; el selector ofrece Last 30 minutes y Last hour. Last 12 hours y Last day requieren Pro; períodos mayores requieren Observability Plus. Por tanto, las búsquedas CLI solicitando siete días no prueban cobertura de siete días. Durante esta revisión (aproximadamente 10:46–10:50 Argentina), las ejecuciones matutinas quedaron fuera de la ventana consultable.
- No se pudo recuperar el resultado programado de Mercado Libre ni afirmar su éxito. No se ejecutó manualmente el cron, ya que eso no reconstruiría el historial programado.

### Ejecución manual autorizada · 28/10/2026, 10:57 Argentina

- Se ejecutaron una vez ambos procesos con Run en Cron Jobs del proyecto logitrack, sobre dpl_AnyxVni2kzUSTcQaTpXTZ4eDvUB2.
- mercadolibre-upkeep: request pr2mc-1793195857667-283363910f08, inicio 10:57:37; HTTP 200, respuesta finalizada en 38,1 s (función 37,79 s), sin errores registrados. La traza muestra consultas reales a pedidos, envíos y base de datos. El panel no conserva el cuerpo JSON con resultados por cuenta: no se confirman cantidades ni éxito individual sólo con HTTP 200.
- mercadolibre-sync: request qm5pv-1793195850786-f3f73364068a, inicio 10:57:30; HTTP 504. Vercel registra: Task timed out after 300 seconds. La separación del mantenimiento de abiertas no elimina el agotamiento del tiempo en la sincronización principal. No se puede afirmar que todas las cuentas, conciliación o reconstrucción del resumen hayan terminado. Puede haber escrituras parciales previas al corte.
- Pendiente de corrección: localizar la fase que consume el presupuesto en syncMercadoLibreOrders, recoverMercadoLibreNotifications, reconcileMercadoLibreFinance y rebuildSnapshot; agregar tiempos y resultados por cuenta sin secretos, y dividir o hacer reanudable el trabajo antes de repetir la verificación. No ampliar simplemente la afirmación de éxito ni repetir ejecuciones sin diagnóstico.
- Esta prueba fue manual; la revisión programada de mañana conserva su propósito de comprobar el disparo automático.

### Corrección y verificación completa · 28/10/2026

- Código dddb76e: el cron guarda las ventas con hasta cuatro órdenes simultáneas por cuenta, manteniendo las cinco páginas de 50, el aislamiento de errores y los reintentos. Otros consumidores conservan el recorrido en serie por defecto. Se agregan tiempos por etapa y resultados por cuenta al registro; el resultado de conciliación fallido ya no se etiqueta correcto.
- Validación: npm test, 164 pruebas aprobadas; ESLint de los archivos modificados sin errores. Las pruebas nuevas verifican paginación, límite de concurrencia, aislamiento/reintento de una venta fallida y comportamiento serial por defecto.
- Publicado mediante npm run deploy:production a dpl_6PvPaxEhGPgeRkHECSS4vr1iRGxc, https://logitrack-ib0kzxpx6-lucio-tamborinis-projects.vercel.app. Compilación remota con npm run build y controles de rutas HMAC, dominios y recursos aprobados antes de promover.
- Prueba manual del cron corregido: request 7bjbp-1793197277860-30d837564064, HTTP 200. Cuenta 3: 250 ventas guardadas, conciliación correcta, 208296 ms hasta completar la cuenta. Cuenta 91: 250 ventas guardadas, conciliación correcta, 206801 ms. Ambas completaron el guardado inicial en unos 134 segundos. El registro confirma snapshot done del espacio 1 y sync complete con ok=true, connections=2 y totalSynced=500.
- Este total corresponde a registros sincronizados (incluye actualizaciones), no a 500 ventas nuevas. La reconstrucción del resumen también terminó antes del límite de 300 segundos. Una ejecución correcta no garantiza que cualquier latencia futura entre en el presupuesto; los nuevos registros permiten identificar la etapa si vuelve a ocurrir. Se mantiene la revisión programada para comprobar el disparo automático.

### Seguimiento automático · 29/10/2026, 09:19 Argentina

- Consulta de producción sin filtro de rama: mercadolibre-upkeep ejecutado a las 08:43:46, request 77srk-1793274226329-af29d85b4b78, HTTP 200 y sin errores en el registro accesible, sobre dpl_6PvPaxEhGPgeRkHECSS4vr1iRGxc. No se dispararon procesos manuales durante esta revisión. El registro no incluye resultados por cuenta; HTTP 200 no confirma esas cantidades.
- No aparecen solicitudes de mercadolibre-sync en la última hora. Pedir tres horas tampoco devolvió registros; el límite de retención impide inferir si se ejecutó antes de las 08:19. No se confirma fallo ni éxito del proceso principal con esta evidencia.
- La configuración efectiva de Vercel sigue habilitada y conserva ambas definiciones en el despliegue corregido. Se mantiene el seguimiento para capturar la ejecución principal dentro de su ventana de retención.

### Seguimiento automático · 30/10/2026, 09:12 Argentina

- Consultadas ambas rutas en los logs de producción de la última hora, sin filtro de rama. mercadolibre-upkeep figura a las 08:43:46 Argentina, request pdttd-1793360626130-8264db910f3e, HTTP 200, sobre dpl_CtszbRCqf5sheVuWbPAxDzPyNNEF. El registro accesible no contiene mensajes de error ni resultados por cuenta; no permite confirmar éxito individual, cantidades o duración.
- mercadolibre-sync no aparece en la ventana consultable. Una ejecución anterior a las 08:10 puede haber quedado fuera de la retención; no se infiere fallo ni éxito por ausencia de registros.
- La configuración efectiva del proyecto logitrack confirma ambos cron habilitados, con horarios 11:00 y 11:20 UTC, asociados al despliegue citado. Se consultó esta configuración por API; no se pudo inspeccionar el panel gráfico en esta revisión. No se dispararon procesos manuales. Se mantiene el seguimiento sin afirmar éxito completo.

### Seguimiento automático · 02/11/2026, 09:19 Argentina

- Logs de producción de la última hora, sin filtro de rama: mercadolibre-upkeep a las 08:43:46 Argentina, request 8rpwb-1793619826140-1b830cff5ab1, HTTP 200, despliegue dpl_2sN61nCygqwHVL5fRZZD2EUpjBY6. Sin mensajes de runtime ni resultados por cuenta en el registro disponible; no se confirma éxito individual ni duración.
- mercadolibre-sync no aparece en esta ventana; la ausencia no prueba fallo ni éxito, dado el límite de retención. La API del proyecto confirma ambos cron habilitados a las 11:00 y 11:20 UTC. No se inspeccionó el panel gráfico ni se dispararon sincronizaciones manuales. Continúa pendiente la conclusión de ambos procesos.

### Seguimiento automático · 03/11/2026, 09:20 Argentina

- Logs de producción de la última hora sin filtro de rama: upkeep a las 08:43:46 Argentina, request wh7qb-1793706226106-70508caeb081, HTTP 200 sobre dpl_2sN61nCygqwHVL5fRZZD2EUpjBY6, sin mensajes de runtime ni resultados por cuenta. No se confirma éxito individual ni duración.
- Sync no aparece en la ventana retenida; esto no demuestra fallo ni éxito. La API confirma ambos cron habilitados a las 11:00 y 11:20 UTC. Panel gráfico no inspeccionado en esta revisión. Sin ejecuciones manuales; continúa pendiente la conclusión verificable de ambos procesos.

### Fallo parcial programado · 04/11/2026, 09:05 Argentina

- Logs de producción de la última hora sin filtro de rama, despliegue dpl_9oMEVnzAm6QkYsvXCZvDKvoGgT3L: sync iniciado a las 08:07:48, request lhj6v-1793790468120-c1efe4a2c8a7, HTTP 200 pero resultado final ok=false. Cuenta 3 guardó 250 registros y terminó conciliación con ok=false a los 180255 ms; cuenta 91 guardó 250 y terminó con ok=true a los 176265 ms. Snapshot del espacio 1 completado. No se observa timeout. Los objetos internos de conciliación están abreviados como [Object]/[Array], por lo que el registro no permite identificar la operación o causa concreta del fallo de cuenta 3. Los 500 registros incluyen actualizaciones, no representan ventas nuevas.
- Upkeep a las 08:43:46, request wl6qb-1793792626139-619a6edb5917, HTTP 200 sin mensajes de runtime ni resultados por cuenta; no se afirma éxito individual. La API del proyecto confirma ambos cron habilitados con horarios 11:00 y 11:20 UTC; no se inspeccionó el panel gráfico. No se dispararon ejecuciones manuales ni se modificaron credenciales. Sigue pendiente el resultado por cuenta de upkeep y el diagnóstico de conciliación fallida.

### Seguimiento automático · 05/11/2026, 09:09 Argentina

- Logs de producción de la última hora sin filtro de rama: upkeep a las 08:43:46 Argentina, request ghnn9-1793879026141-897b0aeb4661, HTTP 200 en dpl_DcpByfxwDMsiTxZGmj7nY6EDNwzq, sin mensajes de runtime ni resultados por cuenta. No permite afirmar éxito individual ni duración.
- Sync no aparece en la ventana retenida: no se puede confirmar su resultado ni la resolución del fallo parcial del 04/11. La API del proyecto confirma ambos cron habilitados a las 11:00 y 11:20 UTC en el despliegue citado. Panel gráfico no inspeccionado. No se dispararon procesos manuales. Continúa el seguimiento.
