# Propuesta editable de condiciones de la beta

Borrador para que el responsable comercial y legal lo complete. No es un texto vigente ni asesoramiento legal.

| Punto | Propuesta inicial | A decidir |
|---|---|---|
| Prestador | [razón social, CUIT, domicilio, contacto] | Sí |
| Modalidad | Beta gratuita acompañada para 2 o 3 comercios | Gratis o paga |
| Duración | 60 días renovables por acuerdo | Sí |
| Límites | 1 espacio por comercio, hasta 5 miembros, sin garantía de disponibilidad | Cifras |
| Soporte | `soporte@geomodi.com`, días hábiles, respuesta objetivo 1 día hábil | Verificar recepción y horario |
| Datos | Los datos son del comercio; se conservan mientras dure el acceso | Plazo posterior a la baja |
| Salida | Exportación a pedido (manual) y baja de accesos en 5 días hábiles | Plazos y formato |
| Registros que se conservan | Auditoría de accesos y facturación, el mínimo exigido | Revisar con asesor legal |

## Procedimiento de exportación y baja (manual)

1. Verificar identidad del solicitante y su pertenencia al espacio; registrar la solicitud.
2. Exportar por espacio (`workspace_id`) las tablas de envíos, pedidos, transportistas, zonas y tarifas a CSV; revisar el contenido y entregarlo por un canal seguro.
3. Baja: quitar miembros desde **Espacio y miembros → Quitar acceso** (auditado), desconectar integraciones y revocar tokens de tienda.
4. Eliminación de datos: no existe aún un procedimiento validado; incluye la base, copias cifradas (se renuevan sin borrado automático) y Redis. No marcar como terminada hasta verificar cada destino.
5. Probar el procedimiento con un espacio ficticio antes de la primera beta (pendiente).

No se enviarán invitaciones ni correos sin instrucción explícita.
