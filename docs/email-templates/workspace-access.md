# Notificación de acceso a GeoModi

Estado: preparado para aplicar en la plantilla `invitation` de la instancia de producción de Clerk. Todavía no se modificó la configuración de producción.

- Remitente: `GeoModi <notifications@geomodi.ai>` (From local part: `notifications`).
- Asunto: `Tu acceso a GeoModi está listo`.
- Preencabezado: `Ingresá al espacio de trabajo que te asignaron.`
- Entrega: conservar **Delivered by Clerk** activado.
- Botón: **Entrar a GeoModi**, con el `action_url` generado por Clerk; no reemplazarlo por una URL fija.
- Contenido: `workspace-access.html`, en formato de plantilla Revolvapp de Clerk.

Conservar las demás plantillas de autenticación. El recorrido de inicio de sesión o registro sigue determinado por `/workspace-access`; el correo no otorga permisos por sí mismo.

El remitente y el texto son señales que Gmail puede utilizar para clasificar el mensaje. No existe una propiedad del correo que fuerce la pestaña Notificaciones/Actualizaciones para todos los destinatarios. Una reclasificación o filtro en la cuenta de Lucio solo afecta esa cuenta y no sustituye la comprobación con destinatarios nuevos.

Referencias oficiales:

- https://clerk.com/docs/guides/customizing-clerk/email-sms-templates
- https://support.google.com/mail/answer/3094499

Validación pendiente tras aplicar: vista previa de Clerk; envío autorizado de prueba; comprobación de remitente, asunto, botón y categoría recibida. No afirmar que cambiar el remitente garantiza la categoría.
