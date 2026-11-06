# Diagrama de Secuencia - GeoModi

## Descripción General

GeoModi es una aplicación de logística e-commerce que se integra con múltiples plataformas de venta (Tienda Nube, Mercado Libre, Shopify) y operadores logísticos (Flex, Colecta, Correo Argentino, Zipnova).

Este documento ilustra los flujos principales de interacción entre la aplicación, las APIs externas y la base de datos.

---

## 1. Flujo de Autenticación y Registro

```
Usuario          Frontend (Next.js)        Clerk Auth        Backend API        Turso DB
  |                      |                     |                 |                |
  |-- Accede a /login -->|                     |                 |                |
  |                      |-- Solicitud auth -->|                 |                |
  |                      |<-- Formulario login-|                 |                |
  |-- Credenciales ----->|                     |                 |                |
  |                      |-- Verifica creds -->|                 |                |
  |                      |<-- Token session ---|                 |                |
  |                      |                     |                 |                |
  |                      |-- GET /api/auth/sync ---------------->|                |
  |                      |                     |                 |-- Query user -->|
  |                      |                     |                 |<-- User data ---|
  |                      |<-- User session ---------------------|                 |
  |<-- Redirige /app ---|                     |                 |                |
```

### Objetivos del flujo
- Autenticación segura via Clerk
- Sincronización de usuario con base de datos local
- Gestión de roles y permisos (admin, user, global_admin)

---

## 2. Flujo de Instalación/Configuración de Integración (Tienda Nube)

```
Usuario          Frontend               Backend API           Tienda Nube API      Turso DB
  |                  |                       |                      |                |
  |-- Click -------->|                       |                      |                |
  |  "Conectar       |                       |                      |                |
  |   Tienda Nube"   |                       |                      |                |
  |                  |-- POST /api/admin/tiendanube/connect --------->|                |
  |                  |<-- Redirect URL ------|                      |                |
  |                  |                       |                      |                |
  |                  |-- Redirige a Tienda Nube OAuth               |                |
  |<-- Autoriza app -|                       |                      |                |
  |                  |<-- Callback con code ------------------------|                |
  |                  |<-- GET /api/integrations/tiendanube/callback --|                |
  |                  |                       |-- Exchange code ----->|                |
  |                  |                       |<-- Access token ------|                |
  |                  |-- POST /api/admin/tiendanube/finish ---------->|                |
  |                  |                       |-- Save integration -->|                |
  |                  |                       |                       |-- INSERT ----->|
  |                  |<-- Success redirect --|                      |                |
  |<-- Integración  |                       |                      |                |
  |  configurada     |                       |                      |                |
```

### Objetivos del flujo
- OAuth 2.0 con Tienda Nube
- Almacenamiento seguro de tokens
- Registro de conexión en base de datos

---

## 3. Flujo de Subida de Etiquetas (ZPL)

```
Usuario          Frontend               Backend API           Turso DB
  |                  |                       |                |
  |-- Drag & Drop -->|                       |                |
  |  archivo ZPL     |                       |                |
  |                  |-- POST /api/upload ----|                |
  |                  |  (multipart/form-data) |                |
  |                  |                       |-- Parse ZPL    |                |
  |                  |                       |-- Extract data |                |
  |                  |                       |-- Validate     |                |
  |                  |                       |-- INSERT ----->|
  |                  |                       |  shipments     |
  |                  |<-- Response -----------|                |
  |                  |  { parsed, errors }    |                |
  |<-- Muestra       |                       |                |
  |  resultados      |                       |                |
```

### Objetivos del flujo
- Parseo eficiente de archivos ZPL
- Validación de datos antes de insertar
- Feedback inmediato al usuario
- No realizar polling innecesario

---

## 4. Flujo de Asignación de Transportistas (Flex)

```
Usuario          Frontend               Backend API           Turso DB
  |                  |                       |                |
  |-- Accede a       |                       |                |
  |  "Logística Flex"|                       |                |
  |                  |-- GET /api/shipments ->|                |
  |                  |  ?method=flex          |-- Query ------>|
  |                  |<-- Shipments ----------|                |
  |                  |-- GET /api/flex-health ->|                |
  |                  |                       |-- Query zones ->|
  |                  |                       |-- Query mappings>|
  |                  |<-- Health status ------|                |
  |                  |  (green/yellow/red)    |                |
  |                  |                       |                |
  |-- Click "Re-     |                       |                |
  |  asignar Flex"   |                       |                |
  |                  |-- POST /api/shipments ->|                |
  |                  |  /reassign-flex        |-- Apply rules ->|
  |                  |                       |-- Update ------->|
  |                  |<-- Result -------------|                |
  |<-- Actualiza UI |                       |                |
```

### Objetivos del flujo
- Uso de zone_mappings para asignación automática
- Semáforo operativo para visibilidad de estado
- Reasignación bajo demanda, no polling continuo

---

## 5. Flujo de Impresión V2 (Print Agent)

```
Print Agent        Backend API           Turso DB        Impresora
  |                     |                   |               |
  |-- POST /api/v2/     |                   |               |
  |  print-jobs/intake ->|                   |               |
  |  { integrity,       |                   |               |
  |    labels,          |-- Validate ------|                |
  |    agent_version }  |-- Check integrity|                |
  |                     |-- INSERT --------|                |
  |                     |  print_jobs       |               |
  |<-- 200/422 ---------|                   |               |
  |                     |                   |               |
  |-- Imprime labels ----------------------------->|        |
  |                     |                   |               |
  |-- Valida integridad |                   |               |
  |  (fingerprints)     |                   |               |
  |                     |                   |               |
  |-- Si mismatch:      |                   |               |
  |  NO imprime         |                   |               |
  |  Genera reporte     |                   |               |
  |  *.integrity.json   |                   |               |
```

### Objetivos del flujo
- Validación estricta de integridad antes de imprimir
- No usar fallback legacy si hay mismatch
- Trazabilidad completa de impresión

---

## 6. Flujo de Webhooks Operativos (Tienda Nube)

```
Tienda Nube      Backend API           Turso DB        Frontend
  |                   |                   |               |
  |-- Evento nuevo -->|                   |               |
  |  (pedido creado,  |                   |               |
  |   estado cambiado)|                   |               |
  |                  |-- Validate HMAC -->|                |
  |                  |-- Process event -->|                |
  |                  |-- UPDATE/INSERT -->|                |
  |                  |                   |               |
  |                  |                   |-- Refresh ---->|
  |                  |                   |  (via SWR/     |
  |                  |                   |   revalidation)|
  |<-- 200 OK -------|                   |               |
```

### Objetivos del flujo
- Escuchar webhooks en lugar de polling continuo
- Validación de seguridad (HMAC)
- Actualización eficiente de datos

---

## 7. Flujo de Webhooks de Privacidad (Tienda Nube)

```
Tienda Nube      Backend API                         Turso DB
  |                   |                                  |
  |-- store-redact -->|                                  |
  |                  |-- Valida firma HMAC ------------>|
  |                  |-- Borra conexión, token y pedidos|
  |<-- 200 OK -------|                                  |
  |                   |                                  |
  |-- customers-redact ------------------------------->|
  |                  |-- Valida firma HMAC ------------>|
  |                  |-- Anonimiza datos personales ---->|
  |<-- 200 OK -------|                                  |
  |                   |                                  |
  |-- customers-data-request ------------------------->|
  |                  |-- Valida firma HMAC ------------>|
  |                  |-- Exporta datos guardados ------->|
  |<-- 200 OK -------|                                  |
```

### Objetivos del flujo
- Cumplir con solicitudes de privacidad de Tienda Nube.
- No conservar tokens o pedidos cuando la tienda solicita borrado.
- Anonimizar datos personales de clientes cuando corresponde.

---

## Buenas Prácticas Aplicadas

### Uso eficiente de recursos
- **Webhooks** en lugar de polling continuo para cambios en entidades externas
- **Reasignación bajo demanda** en lugar de modificación constante de stock
- **Validación previa** antes de operaciones costosas (impresión)

### Robustez
- Validación de integridad en flujo de impresión
- Manejo de errores con feedback al usuario
- Estados de carga visibles (skeletons, spinners)

### Seguridad
- OAuth 2.0 para integraciones
- Validación HMAC para webhooks
- Tokens seguros para print agent

---

## Métricas de Eficiencia

| Flujo | Método | Frecuencia |
|-------|--------|------------|
| Autenticación | Clerk Session | Por sesión |
| Integración Tienda Nube | OAuth 2.0 | Una vez por conexión |
| Subida de etiquetas | Upload manual | Bajo demanda |
| Asignación Flex | Reasignación manual | Bajo demanda |
| Impresión V2 | Print Agent | Bajo demanda |
| Webhooks | Push desde Tienda Nube | Evento-driven |
