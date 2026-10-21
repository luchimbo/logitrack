# GeoModi: fuente y publicación

- La fuente principal de GeoModi es este repositorio en `D:\Logística`. Incorporar aquí los cambios antes de publicar; una carpeta temporal no es la fuente de futuras versiones.
- PC MIDI (78394) y la demo (7570182) usan cross-selling en producción. Conservar sus dominios, rutas del módulo e informe, eventos `seen`, aceptaciones en Redis y registro de pedidos. `docs/crossselling-online.md` conserva el historial inicial; el procedimiento vigente está en `docs/deployment-crossselling.md`.
- `/api/cross-selling/config`, `/module` y `/report` autentican por HMAC en sus handlers. Deben pasar el proxy sin pedir sesión Clerk. Las rutas administrativas siguen requiriendo sesión. No agregar una excepción global para `/api/cross-selling/*`.
- Antes de publicar, ejecutar `npm test`. `npm run build` también ejecuta las pruebas de cross-selling mediante `prebuild`; no omitir ese control con `next build` directo.
- Publicar con `npm run deploy:production`: comprueba el proyecto `logitrack`, crea un despliegue sin asignar dominios y verifica las rutas y dominios de tiendas antes de promoverlo. Si una comprobación falla, resolverla y conservar la versión pública anterior.
- El proyecto público de Vercel es `logitrack` (`prj_whyqDb9sDWCJ1VrBcY3cNxWr5pOJ`), no `logitrack-tan`. Mantener los cambios en Git; no publicar una copia vieja que pierda funciones de otros módulos.
- No cambiar claves, repetir OAuth, reinstalar scripts ni crear promociones para resolver una regresión de código o del proxy.
