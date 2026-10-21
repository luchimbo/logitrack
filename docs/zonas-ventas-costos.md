# Ventas y costos por zona

La sección **Ventas y costos** del menú Operación reúne ventas brutas pagadas de
Mercado Libre, gastos Flex y Colecta, tarifas y liquidaciones.

## Qué se puede consultar

- Ventas brutas, pedidos pagados y gasto logístico de la selección.
- Desglose por CABA, GBA 1, GBA 2 y GBA 3; al elegir una zona, sus partidos.
- Detalle por envío, con ventas y gastos en columnas separadas.
- Filtros por fechas de despacho, cuenta, modalidad, transportista, zona, partido y estado.
- Porcentaje de gasto sobre ventas, calculado con los envíos que tienen ambos importes completos.
- Exportación CSV con ventas, pedidos pagados, gastos e importes pendientes.
- Tarifas Flex por zona y fecha de vigencia; liquidaciones con borrador, cierre y pago.
- Control de entregas, demoras e incidencias en una sección separada.

## Definiciones

**Ventas brutas pagadas:** `total_amount` del pedido de Mercado Libre (o el total
normalizado ya almacenado), con estado `paid` y moneda ARS. No equivale al dinero
neto acreditado ni a comprobantes fiscales. No descuenta comisiones, impuestos
ni devoluciones parciales. Las ventas canceladas no suman; importes, estados o
monedas no disponibles se señalan como no computables.

**Período:** fecha de despacho del envío, no fecha de compra. Así, las ventas
corresponden a los mismos envíos cuyos costos se comparan. Quitar el período
incluye envíos sin despacho confirmado. El alcance comprende los envíos Flex y
Colecta sincronizados en este espacio, no todas las ventas de todos los canales.

**Paquetes con varios pedidos:** se suman los pedidos distintos del paquete, pero
el costo logístico y la cantidad de envíos se cuentan una vez. Un pedido repetido
en conexiones distintas se cuenta una vez, usando la copia más reciente.

**Datos incompletos:** las ventas conocidas se suman y se informa la cantidad de
pedidos no computables y envíos sin importe de venta. Un paquete con ventas
parciales queda fuera del porcentaje gasto/ventas. Los envíos sin costo conocido
también quedan fuera de ese porcentaje.

## Preparación de publicación

Los cambios están en la copia local. Antes de publicar, integrar el módulo de
finanzas con la revisión actualmente desplegada: esta carpeta también contiene
cambios de Tiendanube, OAuth y cross-selling.

El enlace `.vercel/project.json` de esta carpeta apunta a `logitrack-tan`; según
el registro de despliegue en `crossselling-online.md`, `geomodi.ai` utiliza el
proyecto `logitrack`. Verificar el destino real al publicar.

Validación automatizada: pruebas de ventas pagadas, moneda, importes faltantes,
cancelaciones, varios pedidos por paquete, duplicación entre conexiones,
aislamiento entre espacios, filtros de fechas y conciliación de totales por zona.
La verificación con datos y sesión de producción queda pendiente de publicación.
