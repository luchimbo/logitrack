# Costos, ventas y seguimiento

Trabajo en `codex/nuevos-modulos`. Importes en ARS y fechas de Argentina.

## Reglas acordadas

- Flex: una tarifa por transportista y zona común (CABA, GBA 1, GBA 2, GBA 3).
- El cargo se genera al entregar. Se aplica la tarifa vigente en la fecha real de entrega, no en la fecha de sincronización. Se puede programar para el inicio del mes o cualquier fecha.
- Tarifas versionadas y cargos Flex congelados: cambios posteriores no alteran cargos registrados. Un paquete sin datos suficientes queda pendiente, nunca se interpreta como costo cero.
- Colecta: costo del vendedor identificado por su cuenta en `/shipments/{id}/costs`, no costo del comprador ni precio de lista. Los importes ML pueden cambiar y se conserva la respuesta fuente.
- Ventas: importe de órdenes pagadas por fecha de venta; costos Flex por fecha de entrega; costos Colecta por fecha de creación del envío. Se muestran separadamente estas bases de fecha. No es facturación fiscal ni ganancia neta: no se descuentan comisiones, impuestos, producto ni devoluciones parciales.
- Una venta cuenta una vez por cuenta y order ID. Un costo cuenta una vez por cuenta y shipment ID, incluso si varias ventas comparten un paquete.
- Filtros de período, cuenta, modalidad, zona/provincia y transportista. Simulación de variación porcentual sobre costos Flex conocidos sin escribir cargos.
- Seguimiento de ML con historial, plazo de entrega, demoras y última sincronización. No inferir entrega por impresión, despacho o estado local.

## Implementación

Tarifas e informes separados por workspace; se reutiliza el catálogo global existente de transportistas. Nuevas tablas aditivas para tarifas, cargos Flex y costos ML. Pantallas de tarifas y análisis/entregas en la navegación existente. Recuperación de notificaciones pendientes durante el cron y consulta de costos durante la sincronización.

## Desarrollo y validación

Usar SQLite local (`TURSO_DATABASE_URL=file:local.db`) sin token remoto. Vista demo con datos sintéticos y sin credenciales. Probar vigencias, duplicados, cargos históricos, ausencia de tarifa, costo cero explícito, costo del vendedor, filtros y demoras. Validar luego una cuenta real de ML y una base de preview separada.

## Publicación

Subir únicamente esta rama. Revisar configuración de Vercel y datos de preview antes de desplegar. La cuenta de ML, permisos, suscripciones a webhooks y campos efectivamente devueltos se verifican con credenciales reales. No publicar credenciales ni reutilizar una base de producción para pruebas.

## Uso de la primera versión

- `npm ci` y `npm run dev -- --port 3100`. Abrir `/demo-finance` para revisar las tres pantallas con datos sintéticos. No guarda tarifas ni consulta APIs.
- Para la demo local sin Clerk, configurar `LOCAL_FINANCE_DEMO=1` en `.env.local`. Esta opción solo funciona con `NODE_ENV=development` y no habilita acceso a APIs privadas.
- Para la app autenticada, quitar esa opción y configurar las claves Clerk de desarrollo. La base local usa `TURSO_DATABASE_URL=file:local.db` sin token Turso.
- Navegación: Tarifas transportistas, Ventas y costos, Control de entregas. Guardar otra vez el mismo transportista/fecha corrige esa vigencia; los cargos ya registrados permanecen congelados.
- `Sincronizar ventas del rango` consulta órdenes pagadas creadas en ese período, en páginas de 10 por cuenta. Una acción tiene un límite de 200 ventas por cuenta; si quedan más, se indica reducir el rango. Los filtros del informe actúan sobre los datos ya guardados.
- La primera versión cruza órdenes de Mercado Libre con sus etiquetas importadas para conocer el transportista. Envios sin esa asociación o sin clasificación de zona aparecen como pendientes. No calcula automáticamente costos de etiquetas independientes sin una orden ML vinculada.
- No se calculan devoluciones parciales, comisiones, IVA ni utilidad. Los importes de ventas son brutos de órdenes actualmente pagadas.
- Suscribir la aplicación ML al tópico `shipments`. La pantalla recarga datos guardados cada minuto. Las notificaciones fallidas se recuperan mediante el cron existente, una vez por día, hasta 20 por ejecución; configurar `CRON_SECRET` es obligatorio. La latencia real depende de las notificaciones de ML.
- `npm test` incluye casos de vigencia, paquetes con varias órdenes, aislamiento de cuentas/workspaces, tarifas faltantes, ceros reales, historial y persistencia. La prueba de store usa una base temporal y requiere Node con `registerHooks` (Node 22.15+).

Referencia del costo del vendedor: https://developers.mercadolibre.com.ar/es_ar/publica-productos/mercado-envios-costos-y-cotizaciones
