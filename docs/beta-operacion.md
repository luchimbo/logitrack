# Inicio y operación de la beta de GeoModi

Este documento prepara el acompañamiento inicial. No sustituye los términos publicados ni afirma que se haya verificado la recepción de correos, una baja completa o una integración de terceros.

## Empezar

1. El administrador asigna el correo desde **Espacio y miembros**. Una invitación caduca a los siete días; la membresía se conserva. El estado «enviado» significa que Clerk aceptó el envío, no que llegó a la bandeja.
2. Ingresar con el mismo correo. En **Operación de hoy**, abrir **Primeros pasos**. El estado se calcula con la información del espacio; configurar zonas es opcional si no se usa Flex.
3. Conectar un canal disponible o subir etiquetas compatibles. Comprobar que aparezcan los primeros envíos antes de preparar pedidos.
4. Abrir **Picking** y revisar productos y cantidades. Para Flex, configurar transportistas y zonas y revisar asignaciones antes de despachar.
5. Consultar etiquetas y preparar el despacho con el flujo existente. La impresión local conserva su procedimiento de instalación actual.

## Problemas frecuentes

- **La invitación no llegó:** revisar spam y confirmar que el correo coincida; un administrador puede reenviar el acceso. El envío requiere esperar un minuto entre intentos.
- **No aparecen pedidos:** verificar canal conectado, filtros y período. Actualizar la integración y registrar el mensaje exacto si persiste.
- **Flex sin asignación:** revisar partido y configuración de zonas antes de cambiar paquetes manualmente.
- **La impresión falló:** no repetir una impresión sin revisar la cola y el resultado anterior; consultar el diagnóstico del agente existente.
- **El servicio está caído:** comunicar que no se confirmó la operación y seguir el procedimiento de contingencia del comercio. El operador puede ejecutar `scripts/check-operational-health.ps1`.

## Soporte y solicitudes de datos

El canal publicado es `soporte@geomodi.com`; su recepción real debe comprobarse antes de invitar clientes. En el pedido incluir correo de la cuenta, nombre del espacio, módulo, hora aproximada y descripción; no enviar contraseñas ni tokens. Para una solicitud de datos, verificar la identidad y el espacio, registrar la solicitud, acordar el alcance y revisar el contenido antes de entregarlo por un canal seguro.

Para retirar a una persona, un administrador usa **Espacio y miembros → Quitar acceso**; se conserva el contenido del espacio. Esto no equivale a borrar la cuenta de Clerk ni a eliminar los datos del comercio. Las solicitudes de exportación o eliminación completas requieren un procedimiento validado por tipo de dato, incluidas integraciones, copias y Redis; no marcar una solicitud como terminada hasta verificar cada destino.

## Ficha editable antes de la beta

- Responsable legal y datos de contacto: **pendiente**.
- Modalidad de acceso, precio o gratuidad: **pendiente**.
- Duración, límites y condiciones de salida: **pendiente**.
- Horario de soporte, responsable y tiempo de respuesta comprometido: **pendiente de validar**.
- Política de conservación, exportación y eliminación de datos: **pendiente de validar**.
- Comercios participantes y autorización de invitación: **pendiente**.

No enviar invitaciones ni mensajes hasta que exista instrucción explícita para hacerlo. Durante la beta registrar incidentes, tiempo hasta el primer despacho y bloqueos de uso, sin guardar credenciales ni datos personales innecesarios.
