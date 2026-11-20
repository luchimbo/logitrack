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

## Publicación del mapa · 21/10/2026

Revisión `bc131bf`, despliegue `dpl_BXp4wS11wLQAPwWR9r8dPv8fGMhN`,
`https://logitrack-awk5n3x1r-lucio-tamborinis-projects.vercel.app`, activo en
`www.geomodi.ai`. Versión anterior: `dpl_GyR3caF89o1CvpqnkBcpWi3S9vqw`.

95 pruebas aprobadas, lint sin errores y compilación local/remota correcta.
Verificación de producción con sesión disponible: mapa inicial, período Todo,
selección CABA, resumen de un envío local sin datos financieros y paso a Detalle
con `zones=CABA`; el enlace CSV respeta la selección. El acceso al resumen sin
sesión devuelve 401. No se modificaron tarifas, pagos ni asignaciones de zonas.


## Corrección del saldo · 22/10/2026

El saldo provisional usa una única base: ventas brutas conocidas más envío cobrado en Tiendanube menos cargos
ML conocidos menos todos los costos logísticos conocidos de la selección. Una
venta con costo de envío o cargos pendientes conserva su importe en el saldo;
los gastos sin venta vinculada también se descuentan. El resumen del mapa
recalcula la misma cuenta al combinar zonas, incluso las que sólo tienen gastos.

Se muestra un único saldo y se explican los envíos sin costo, sin venta y con
cargos de ML incompletos. Es un saldo con importes conocidos, no una liquidación
final: no incluye costo de mercadería, retenciones ni comisiones de otros canales.
El porcentaje logístico conserva su base de envíos con venta completa y costo
conocido; la pantalla identifica esos dos importes explícitamente.

Las regresiones comprueban que completar un costo sólo descuenta ese costo, que
los cargos se descuentan una vez y que mapa y detalle concilian aunque existan
ventas o gastos sin vincular. Esta sección describe la corrección en código;
no confirma una publicación en producción.

## Tiendanube reemplaza a Zipnova en el informe · 22/10/2026

El informe financiero deja de consultar Zipnova, contar sus registros
independientes y deducir vínculos con ventas de Mercado Libre. La integración
operativa de Zipnova conserva etiquetas y seguimiento. Mercado Libre mantiene
sus ventas, cargos, Flex y Colecta.

Se incorporan los pedidos pagados, no cancelados y con dirección de envío de
Tiendanube del mismo espacio. Se deduplican por tienda y pedido; se excluyen
los importados desde Mercado Libre (`source=meli`) para no contar la venta dos
veces. Cada pedido TN representa un registro, no una confirmación de cuántos
paquetes físicos se enviaron.

El envío de checkout no es un producto: `shipping_cost_customer` es lo cobrado
al cliente y `shipping_cost_owner` el costo para el vendedor informado por
Tiendanube. Se guardan por separado. Los importes ausentes quedan desconocidos;
cero sigue siendo válido. La mercadería es el total menos el envío cobrado,
que se muestra aparte y tiene su propia columna en el CSV. No se toma el cobro
al cliente como prueba del costo real del transporte.

El período sigue siendo por despacho confirmado. Los pedidos TN sin despacho
quedan fuera del período y se pueden revisar con Todo. Actualizar datos recorre
las conexiones TN del espacio por páginas, sin el límite de 500 pedidos de la
vista operativa, para recuperar importes nuevos y estados históricos. No busca
datos en otros espacios ni requiere reinstalar la integración.

La versión del resumen precalculado y la caché del navegador cambia a 8. Los
resúmenes incompatibles se reconstruyen antes de responder, para evitar que
reaparezcan gastos o registros de Zipnova. Las pruebas incluyen separación de
mercadería y cobro de envío, importes faltantes/cero, cancelaciones, duplicados,
aislamiento por espacio, detalle y resumen y persistencia SQL de la sincronización.

Referencia de campos: https://tiendanube.github.io/api-documentation/v1/resources/order

Publicado en `www.geomodi.ai` mediante `npm run deploy:production`:
`dpl_6ED1JkZ4Q1j9Rc9Y3LAM5v35kJNC`,
`https://logitrack-fydk2trvs-lucio-tamborinis-projects.vercel.app`.
Código: `1230c4a`, rama `codex/tiendanube-envios-finanzas-20261022`.
Se publicaron conjuntamente la fuente TN y la conciliación del saldo provisional.
Compilación local y remota correctas, lint sin errores y 122 pruebas aprobadas
con `npm test -- --test-concurrency=1`. La ejecución paralela de Node en Windows
cerraba el proceso nativo SQLite con `3221225477` después de aprobar sus casos;
la ejecución secuencial ejecuta la misma suite completa y termina correctamente.
Los controles HMAC, dominios de tiendas y recursos de cross-selling pasaron antes
de promover. En el espacio de `camilopcmidi` se observaron dos cuentas ML y ninguna
conexión activa de Tiendanube; no se cambiaron conexiones ni se repitió OAuth.

Verificación posterior con Chrome Camilo: el período 01/10 al 22/10 cargó 859
registros, ventas $180.767.500,56, cargos ML $36.880.940,78, gasto conocido
$5.615.680,00 y saldo provisional $138.270.879,78. Respecto del resumen
inmediatamente anterior (913 registros), desaparecieron exactamente los 54
registros Zipnova y sus $2.373.788 de gasto, conservando ventas y cargos ML.
El CSV contiene 859 filas, cero registros Zipnova y la columna de envío cobrado
TN. Los totales ya difieren de la captura inicial de 887 porque durante la
investigación se incorporaron datos de Mercado Libre adicionales.
