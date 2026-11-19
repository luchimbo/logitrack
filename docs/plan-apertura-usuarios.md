# Plan de apertura de GeoModi a usuarios externos

Fecha: 19/11/2026.

## Estado de implementación

- Desactivadas en el código local las rutas históricas de reparación y migración; responden 410. No se publicaron.
- Lint sin errores (queda una advertencia de imagen), 176 pruebas aprobadas y `npm run build` aprobado con 47 pruebas de cross-selling en prebuild.
- Se ocultaron las integraciones pendientes que no estén conectadas.
- En desarrollo local `npm run dev` usa SQLite aislado y claves Clerk de prueba, sin cargar las variables de producción; Preview rechaza el host operativo y todavía necesita una base propia.
- Implementada localmente la separación de zonas y transportistas por espacio, con compatibilidad de IDs y enlaces legacy. Debe completarse y verificarse la migración de tarifas históricas antes de publicar.
- Copia cifrada fuera del servidor configurada en esta PC con tarea diaria; restauración aislada y SQLite verificados. Por decisión del usuario no se utilizará Google Drive. Falta definir una copia fuera del sitio, la custodia independiente de la clave y el respaldo Redis; hay un control operativo horario con alerta local.
- Agregados primeros pasos basados en datos del espacio y baja auditada de miembros. Falta revisión visual y validación de integración.
- 19/11/2026: 187 pruebas, lint (1 advertencia de imagen) y build aprobados. Agregados `scripts/apply-carrier-migration.mjs` (simulación por defecto; exige `--backup-verified`), `docs/recuperacion.md` y `docs/condiciones-beta-propuesta.md`. La carpeta temporal de restauración se eliminó. El control operativo se corrigió (comillas ssh) y se probó con una falla simulada.
- Pendiente: aplicar la migración en producción, Preview con base propia, custodia de la clave y copia fuera del sitio, respaldo Redis, canal de alertas, verificación visual móvil/escritorio, pruebas con dos comercios y tres roles, recepción real de soporte, decisiones legales/comerciales, publicación y beta.
- La consulta de solo lectura en la base operativa encontró 16 tarifas de un espacio no legacy vinculadas a transportistas globales sin coincidencia local por nombre. La simulación transaccional sobre el respaldo restaurado creó 3 transportistas locales y completó con integridad correcta. Aún falta preparar y verificar la aplicación en producción; no publicar antes de completar esa migración y los demás controles.

Objetivo: habilitar una beta acompañada con 2 o 3 comercios independientes y preparar después una apertura más amplia.

Este documento planifica el trabajo; no acredita cambios implementados ni verificaciones de producción. La revisión inicial del repositorio obtuvo 176 pruebas aprobadas. `npm run lint` falló por `react-hooks/set-state-in-effect` en `AppShell.js` y mostró una advertencia de imágenes en `CarrierPortalClient.js`.

## Alcance y condiciones de trabajo

- Trabajar sobre D:\Logística y conservar los cambios en Git, agrupados por etapa.
- Conservar las funciones existentes de PC MIDI y la demo: dominios, módulo e informe, HMAC, eventos seen, aceptaciones en Redis y registro de pedidos.
- No usar Google Drive para los respaldos.
- Mantener el agente de impresión y su configuración actual. Quedan fuera el instalador o descarga preconfigurada, el indicador de conexión y el botón de prueba del agente.
- La impresión existente se verifica en las pruebas del recorrido operativo, sin rediseñarla.
- No cambiar claves, repetir OAuth, reinstalar scripts ni crear promociones para corregir regresiones.

## Etapa 1. Preparar un entorno seguro de trabajo

1. Configurar desarrollo y Preview con una base independiente y datos ficticios. El procedimiento actual documenta que el desarrollo local utiliza la base operativa real.
2. Separar también las conexiones de tiendas, Redis o prefijos de claves, destinos de webhooks y demás recursos que puedan escribir sobre producción. Las pruebas no deben enviar acciones a tiendas reales.
3. Incorporar controles de destino en scripts y documentación para distinguir desarrollo, pruebas y producción sin mostrar secretos.
4. Corregir el error actual de lint y evaluar la advertencia de imágenes. Configurar los controles de CI que falten: pruebas, lint y compilación.

Criterio de cierre: poder iniciar y probar la app con datos ficticios sin credenciales operativas ni efectos sobre producción; pruebas, lint y compilación aprobados.

## Etapa 2. Retirar reparaciones de alcance global

1. Inventariar las rutas de diagnóstico, reparación, migración y prueba, sus permisos y quién las consume.
2. Retirar de la API pública las reparaciones históricas que reasignan datos entre espacios, en particular `/api/admin/reparar`. Revisar también `/api/admin/migrate-legacy`.
3. Conservar las operaciones necesarias como herramientas de mantenimiento: origen y destino explícitos, simulación por defecto, cantidades previstas, validaciones y auditoría. Usar transacciones cuando corresponda y detenerse ante errores.
4. Revisar la autorización de acciones de borrado, asignación, integración, tarifas y liquidaciones. Ocultar un botón no sustituye la validación del servidor.

Criterio de cierre: ninguna ruta pública permite reunir indiscriminadamente datos de varios comercios; las rutas retiradas no modifican datos y los roles sin permiso reciben rechazo.

## Etapa 3. Aislar comercios y su configuración

1. Inventariar las referencias a transportistas y zonas: APIs, asignación automática, carga de etiquetas, sincronizaciones, portales externos, tarifas y liquidaciones.
2. Separar el catálogo geográfico común de las decisiones de cada comercio: sus transportistas habilitados y sus asignaciones de zonas. Si se conserva un catálogo compartido, solo la administración global lo modifica; cada comercio administra su configuración propia.
3. Diseñar una migración con simulación y respaldo. Preservar los IDs y vínculos usados por los portales de PC MIDI, sus asignaciones y su historia financiera. Definir de forma explícita el estado inicial de los demás espacios, sin copiar datos operativos ajenos.
4. Hacer que todas las consultas y escrituras operativas resuelvan el espacio desde la identidad autenticada. Validar también IDs relacionados, relaciones entre tablas, filtros, descargas, trabajos en segundo plano y cachés.
5. Crear pruebas con dos espacios: listas, detalles, modificaciones, borrados, exportaciones, etiquetas y enlaces de transportistas. Incluir intentos de usar IDs del otro espacio.

Criterio de cierre: modificar la logística de un comercio no cambia la del otro; no hay acceso cruzado a datos, y PC MIDI conserva sus enlaces y comportamiento operativo.

## Etapa 4. Respaldos, disponibilidad y recuperación

1. Verificar el estado actual del respaldo nocturno y agregar una copia externa cifrada, con acceso restringido y retención documentada. El procedimiento vigente informa copias en el mismo disco.
2. Restaurar una copia en una base aislada y comprobar integridad, relaciones y una operación básica de lectura. Documentar el resultado y el tiempo requerido.
3. Definir qué datos cubre la recuperación, incluyendo las aceptaciones de cross-selling en Redis y la configuración necesaria. No asumir que el respaldo de libSQL cubre todos los recursos.
4. Implementar controles de disponibilidad de la app y la base, antigüedad del respaldo, fallos de sincronización y acumulación de reintentos. Preparar alertas y acordar destinatario y canal antes de activar envíos externos.
5. Documentar responsables y pasos ante caída del servidor, Internet, Funnel, falta de disco o vencimiento de credenciales. Fijar objetivos de recuperación y pérdida máxima tolerable según la restauración medida.

Criterio de cierre: copia externa comprobada, restauración exitosa y detección probada de una falla simulada; procedimiento operativo utilizable por otra persona.

## Etapa 5. Organizar navegación y primer ingreso

1. Mantener Operación de hoy como entrada principal. Agrupar preparación, picking, etiquetas, Flex y Colecta de forma coherente; dejar informes y configuración en grupos secundarios.
2. Conservar las pantallas existentes y sus enlaces válidos. No crear una pantalla nueva de impresión como parte de este plan.
3. Mostrar módulos según permisos y disponibilidad real. Ocultar las integraciones pendientes para usuarios comunes y mantener las ya conectadas accesibles.
4. Reemplazar o complementar el tour con una lista persistente: conectar una tienda o cargar etiquetas, obtener primeros pedidos/envíos, configurar logística cuando corresponda, preparar picking y acceder a las etiquetas existentes.
5. Calcular el progreso con hechos reales, no solo por visitar pantallas. Permitir omitir pasos opcionales y retomar la guía. No exigir instalar el agente para usar recorridos que no lo necesitan.
6. Preparar estados vacíos y mensajes recuperables que indiquen qué falta, cómo resolverlo y cómo acceder a soporte.

Criterio de cierre: una cuenta nueva sabe qué hacer y puede retomar su avance; navegación y recorridos funcionan en escritorio y móvil, sin perder acceso a funciones actuales.

## Etapa 6. Soporte, acceso y condiciones de la beta

1. Verificar el buzón publicado y la recepción real de invitaciones con cuentas de prueba controladas. La documentación anterior acredita aceptación por Clerk, no llegada al buzón. Los envíos de prueba requieren autorización explícita para enviar mensajes.
2. Preparar una guía breve de inicio, problemas frecuentes, datos que debe incluir un reclamo y respuesta ante bloqueos del despacho.
3. Revisar términos y privacidad: identificar al prestador, precisar proveedores y conservación de datos, bajas, exportación y eliminación; comprobar que las promesas coincidan con el comportamiento real.
4. Dejar definido antes de invitar clientes: modalidad gratuita o paga, duración de prueba, límites, soporte incluido y condiciones de salida. Preparar una propuesta editable para que el responsable comercial complete esos datos.
5. Documentar cómo se procesa una exportación y una baja, qué registros se conservan y cuándo se revocan los accesos. Para el piloto puede gestionarse manualmente; no requiere integrar cobros automáticos.

Criterio de cierre: guía y condiciones revisadas, canal de soporte verificado, recepción de acceso comprobada y procedimiento de salida ejecutable con datos ficticios.

## Etapa 7. Validación final y publicación

1. Probar desde cero dos comercios aislados, con propietario, administrador y operador: registro o invitación, conexión, pedidos, picking, etiquetas, estados, informes y recuperación de errores. Verificar por separado la impresión existente.
2. Revisar la app en móvil y escritorio y probar un volumen representativo de pedidos e historial. Medir tiempos y fijar límites a partir de resultados, sin asumir capacidad no comprobada.
3. Ejecutar `npm test`, `npm run lint` y `npm run build`. No sustituir el build por `next build` directo.
4. Revisar la migración sobre una copia antes de aplicarla. Guardar respaldo y procedimiento de recuperación: volver al código anterior no revierte por sí solo una migración de datos.
5. Publicar mediante `npm run deploy:production` en el proyecto logitrack. Conservar la versión pública anterior si falla una comprobación. Verificar después de promover los recorridos críticos y las dos tiendas con cross-selling.

Criterio de cierre: controles técnicos y operativos aprobados, aislamiento comprobado, restauración documentada y producción verificada.

## Etapa 8. Beta acompañada y apertura gradual

1. Incorporar 2 o 3 comercios con condiciones aceptadas y acompañamiento inicial.
2. Registrar bloqueos, errores, tiempo hasta completar la primera operación y consultas que exigen intervención manual. No enviar invitaciones sin instrucción explícita.
3. Corregir primero pérdida o mezcla de datos, problemas de acceso y bloqueos del despacho; después, fricciones de uso.
4. Ampliar el acceso cuando todos los participantes completen su recorrido, no queden incidentes críticos y la operación y el soporte puedan sostenerse.

## Orden y decisiones pendientes

Orden de ejecución: entorno aislado → herramientas de mantenimiento → aislamiento de comercios → recuperación → experiencia inicial → soporte y condiciones → validación/publicación → beta.

Antes de aplicar cambios de infraestructura o condiciones comerciales deben quedar definidos el destino de la copia externa y su costo, el canal y responsable de alertas, la identidad legal del prestador y la modalidad de acceso. La implementación local, documentación y pruebas independientes pueden avanzar sin esas definiciones.
