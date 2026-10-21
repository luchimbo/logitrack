# Ventas y costos por zona

La sección **Ventas y costos** del menú Operación reúne ventas brutas pagadas de
Mercado Libre, gastos Flex y Colecta, tarifas y liquidaciones.

## Mapa de zonas

La vista inicial permite elegir un período y seleccionar varias zonas del mapa.
Los accesos Hoy, 7 días, 30 días, Este mes, Mes anterior y Todo completan las
fechas; también se puede escribir Desde/Hasta. Los períodos se calculan según
el día de Argentina y la fecha de despacho del envío.

El resumen suma las zonas marcadas. Los promedios ponderan los envíos con costo
conocido y los pedidos pagados con venta conocida; nunca promedian los promedios
de cada zona. El CSV y Ver detalle usan la misma selección. Sin zonas marcadas
se incluyen todas, también envíos sin zona o fuera del área representada.

El mapa usa un resumen compacto de la API (`view=map`), sin enviar todo el detalle
de los envíos al navegador. `zones=CABA,GBA 1` filtra el detalle y CSV. Los datos
se vuelven a consultar cada 60 segundos mientras la pantalla está visible.

Las geometrías locales se generan con `scripts/build-finance-map.py` desde
geoBoundaries ARG ADM2, revisión `9469f09`, con origen IGN, UNHCR y OCHA ROLAC
y licencia CC BY 3.0 IGO. Se incluyen 37 partidos y las 15 comunas de CABA.
La Matanza Norte conserva su clasificación operativa GBA 1 aunque el polígono
del partido completo se dibuje en GBA 2; esto se explica en Cómo se agrupan las
zonas. La selección no modifica configuraciones ni reclasifica envíos.

Pruebas del mapa: selección múltiple, zonas sin datos, conciliación con detalle,
promedios ponderados, pedidos incompletos y períodos con cambio de mes/año y
horario de Argentina. Verificación visual local con datos ficticios: selección
mediante mapa y botones, suma de CABA + GBA 1 y recálculo al elegir 7 días.

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

## Publicación del 21/10/2026

Publicado en `https://www.geomodi.ai`, proyecto Vercel `logitrack`.

- Revisión de código: `d5b2d09a042ef555a9963e6a6753db48fc6f3300`.
- Rama: `codex/zonas-ventas-costos-20261021`.
- Despliegue: `dpl_8pUEgjzYj3rpfC64juWuVVLurb4S`.
- URL de despliegue: `https://logitrack-hgo6iirnn-lucio-tamborinis-projects.vercel.app`.
- Despliegue anterior para reversión: `dpl_G9Jhg72A9HvUBaWDuEM2dSe1QZ2V`.
- Copia de publicación: `C:/Users/PC Midi/AppData/Local/Temp/logitrack-tn-20261016`.

Se integró sobre la misma revisión que estaba en producción (`0997f41`),
conservando las funciones de Tiendanube y cross-selling ya publicadas.
El enlace Vercel de la carpeta principal sigue apuntando a `logitrack-tan`:
para la próxima publicación usar el proyecto `logitrack` de la copia indicada.

Validación: 89 pruebas aprobadas en la copia integrada, compilación local y remota
correctas, lint de los archivos del módulo sin errores. Vercel confirmó estado
READY y alias `www.geomodi.ai` y `geomodi.ai`. La portada responde 200 y las APIs
financieras responden 401 sin sesión.

Con la sesión de navegador disponible se verificó la carga de estadísticas,
filtros, tarifas y liquidaciones sin errores. Ese espacio no tiene ventas de
Mercado Libre vinculadas; no se validaron importes reales de otro espacio ni se
crearon tarifas, liquidaciones o pagos de prueba en producción.

## Corrección de respuestas grandes · 21/10/2026

El primer despliegue podía fallar con `RESPONSE_TOO_LARGE` en espacios con más
historial: las consultas sin límite incluían columnas de etiquetas ZPL y pedidos
completos que no necesitaba el informe. La revisión `d53645e` consulta campos
explícitos, resume el JSON del pedido y recorre la base por ID en lotes de hasta
100 registros. Si la base rechaza un lote por tamaño, reduce el lote y reintenta
sin avanzar el cursor ni omitir envíos. La selección de la copia más reciente y
los totales siguen considerando todo el historial.

Despliegue corregido: `dpl_GyR3caF89o1CvpqnkBcpWi3S9vqw`,
`https://logitrack-59uonzcyy-lucio-tamborinis-projects.vercel.app`, activo en
`www.geomodi.ai`. Reversión anterior: `dpl_8pUEgjzYj3rpfC64juWuVVLurb4S`.

Validación: 90 pruebas aprobadas, compilación local y remota correctas y lint
sin errores. La nueva regresión utiliza 441 envíos físicos, etiquetas y JSON
pesados, duplicados entre páginas y un límite de respuesta simulado; comprueba
que todos los envíos y sus ventas se conservan.
