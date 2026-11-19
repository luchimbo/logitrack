# Revisión de privacidad y términos frente al comportamiento real

19/11/2026. Compara la política publicada en `/privacidad` con lo comprobado en el código. No es asesoramiento legal; las páginas públicas no se modificaron porque dependen de decisiones del responsable.

| Afirmación publicada | Comprobado | Acción propuesta |
|---|---|---|
| «Responsable y alcance» sin identificar al prestador | No hay razón social, CUIT ni domicilio | Completar (decisión del responsable) |
| «Los tokens se guardan cifrados» | Hay cifrado en los módulos OAuth y de integraciones (`cryptoUtils.js`); no se auditó cada tabla | Auditar que ninguna columna de token quede en claro antes de afirmarlo para clientes |
| «Proveedores necesarios» sin nombrarlos | Se usan Vercel (aplicación), Clerk (identidad), Upstash Redis (aceptaciones de cross-selling), servidor propio con Tailscale Funnel (base de datos) y las plataformas conectadas (Tiendanube, Mercado Libre, Shopify, Zipnova) | Listarlos y su ubicación |
| «Conservación: mientras dure el uso» | Copias cifradas: 30 días y mínimo 7 archivos (`backup-offhost.ps1`); respaldo nocturno del servidor sin retención documentada; Redis con vencimiento de claves de eventos | Declarar plazos concretos tras la baja |
| «Respondemos solicitudes de exportación y borrado» | Exportación: `scripts/export-workspace.mjs` (manual, solo lectura, sin credenciales). Borrado completo: **sin procedimiento validado** (copias y Redis) | No prometer plazos de borrado hasta validarlo; declarar que las copias caducan según la retención |
| «No modifica pedidos sin acción del usuario» | No verificado en esta revisión | Confirmar con el equipo antes de mantener la frase |
| Contacto `soporte@geomodi.com` | Recepción real sin verificar | Probar con autorización explícita |

Los términos (`/terminos`) deben revisarse aparte para modalidad, duración, límites y salida, según `docs/condiciones-beta-propuesta.md`.
