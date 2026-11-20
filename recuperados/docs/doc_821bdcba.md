# Guía de Video Demo - GeoModi

## Instrucciones Generales

Este documento sirve como guía para grabar el video de demostración de la aplicación GeoModi, requerido para el proceso de homologación de Tienda Nube.

**Duración estimada:** 10-15 minutos
**Formato recomendado:** MP4, 1080p
**Idioma:** Español (Argentina)

---

## Escenarios Obligatorios

### 1. Instalación de la App (1-2 min)

**URL de instalación:** `https://www.tiendanube.com/apps/{app_id}/authorize`

**Pasos a demostrar:**
1. Navegar a la URL de instalación desde el panel de Tienda Nube (NO desde el panel de la app)
2. Mostrar el flujo de autorización OAuth
3. Mostrar la pantalla de permisos solicitados
4. Confirmar la instalación exitosa
5. Mostrar la redirección al dashboard de la app

**Puntos clave:**
- La instalación debe iniciarse desde Tienda Nube, no desde la app
- Mostrar claramente los permisos que se solicitan
- Verificar que la app aparece en el panel de Tienda Nube después de instalar

---

### 2. Registro de Usuario Nuevo (1-2 min)

**Pasos a demostrar:**
1. Navegar a `/sign-up`
2. Completar el formulario de registro con datos de prueba
3. Mostrar la validación de campos en tiempo real
4. Completar el registro
5. Mostrar la redirección al onboarding o dashboard

**Puntos clave:**
- Mostrar validación de email, contraseña
- Mostrar mensaje de éxito
- Verificar que el usuario queda logueado automáticamente

---

### 3. Login de Usuario Existente (1 min)

**Pasos a demostrar:**
1. Navegar a `/login`
2. Ingresar credenciales de un usuario ya registrado
3. Mostrar el proceso de autenticación
4. Mostrar la redirección al dashboard

**Puntos clave:**
- Mostrar manejo de errores (credenciales incorrectas)
- Mostrar estado de carga durante autenticación
- Verificar acceso correcto al dashboard

---

### 4. Reinstalación de la App (1-2 min)

**Pasos a demostrar:**
1. Desinstalar la app desde el panel de Tienda Nube
2. Volver a instalar usando la URL de autorización
3. Verificar que la app funciona correctamente después de reinstalar
4. Mostrar que los datos/configuraciones se mantienen o se restauran correctamente

**Puntos clave:**
- La app debe funcionar correctamente después de reinstalar
- Mostrar que no hay errores de autenticación residuales
- Verificar que las integraciones se reconectan

---

### 5. Flujo Principal de la App (4-6 min)

#### 5.1 Subir Etiquetas (1 min)
1. Navegar a "Subir Etiquetas"
2. Mostrar la zona de drag & drop
3. Subir un archivo ZPL de ejemplo
4. Mostrar el proceso de parseo y validación
5. Mostrar los resultados (éxitos y errores)

#### 5.2 Gestión de Pedidos (1 min)
1. Navegar a "Pedidos"
2. Mostrar la lista de pedidos
3. Filtrar por estado operativo
4. Seleccionar un pedido y mostrar detalle
5. Mostrar acciones disponibles (iniciar picking, crear incidencia)

#### 5.3 Logística Flex (1 min)
1. Navegar a "Logística Flex"
2. Mostrar el semáforo operativo (green/yellow/red)
3. Mostrar envíos asignados y sin asignar
4. Ejecutar reasignación de transportistas
5. Mostrar resultado de la reasignación

#### 5.4 Colecta (30 seg)
1. Navegar a "Colecta"
2. Mostrar lista de envíos de colecta
3. Mostrar acciones disponibles (ver etiqueta, descargar, eliminar)

#### 5.5 Lista de Picking (30 seg)
1. Navegar a "Lista de Picking"
2. Mostrar productos organizados por método de envío
3. Mostrar métricas de picking

#### 5.6 Dashboard (30 seg)
1. Navegar a "Dashboard"
2. Mostrar métricas por período
3. Cambiar período y mostrar actualización
4. Mostrar gráficos de distribución

---

### 6. Configuración de Integración con Tienda Nube (2 min)

**Pasos a demostrar:**
1. Navegar a "Conectar" (Integraciones)
2. Seleccionar Tienda Nube
3. Mostrar el flujo de conexión
4. Ingresar credenciales/token de Tienda Nube
5. Verificar conexión exitosa
6. Mostrar el módulo de Tienda Nube activo en "Conectadas"
7. Mostrar que la actualización habitual llega por webhook y que "Sincronizar manual" queda como acción de respaldo.

**Puntos clave:**
- Mostrar validación de credenciales
- Mostrar estado de conexión (conectado/desconectado)
- Mostrar datos sincronizados después de conectar
- Mostrar la confirmación antes de desconectar o cambiar credenciales

---

### 7. Configuración y Ajustes (1-2 min)

**Pasos a demostrar:**
1. Navegar a "Ajustes"
2. Mostrar las secciones de configuración:
   - General (nombre empresa, zona horaria, idioma)
   - Notificaciones (toggle de alertas)
   - Impresión (formato de impresión)
   - Datos (zona de peligro)
3. Modificar una configuración y guardar
4. Mostrar confirmación de guardado

**Puntos clave:**
- Mostrar que los cambios se guardan correctamente
- Mostrar feedback al usuario (toast de confirmación)
- Mostrar validación de campos

---

### 8. Estados Vacíos y Manejo de Errores (1 min)

**Pasos a demostrar:**
1. Mostrar una sección sin datos (estado vacío)
2. Mostrar el mensaje y acción sugerida
3. Provocar un error (ej: credenciales incorrectas)
4. Mostrar la página de error con opción de reintentar

**Puntos clave:**
- Los estados vacíos deben ser informativos y accionables
- Los errores deben mostrar mensaje claro y opción de recuperación
- No mostrar errores técnicos crudos al usuario

---

## Cuenta Demo para Homologación

### Credenciales de prueba
- **Email:** demo@geomodi.com
- **Password:** [Proporcionar al equipo de homologación]
- **Tienda Nube:** [Proporcionar tienda de prueba conectada]

### Estado de la cuenta demo
- [ ] Cuenta liberada de suscripciones/pagos
- [ ] Datos de prueba precargados
- [ ] Integración con Tienda Nube activa
- [ ] Al menos 10 envíos de ejemplo
- [ ] Al menos 2 transportistas configurados

---

## Checklist de Validación

Antes de enviar el video, verificar:

- [ ] Video incluye instalación desde Tienda Nube (NO desde panel de app)
- [ ] Video incluye registro de usuario nuevo
- [ ] Video incluye login de usuario existente
- [ ] Video incluye escenario de reinstalación
- [ ] Video cubre todos los flujos del diagrama de secuencia
- [ ] Video muestra flujo completo de uso de la app
- [ ] Video muestra configuración técnica requerida
- [ ] Audio claro y en español
- [ ] Duración entre 10-15 minutos
- [ ] Resolución mínima 1080p
- [ ] No se muestran credenciales reales en pantalla

---

## Notas Adicionales

### Si la app requiere configuración técnica
Incluir una sección adicional explicando:
1. Qué configuración es necesaria
2. Cómo realizarla paso a paso
3. Dónde encontrar la información requerida

### Puntos relevantes para homologación
- Mostrar que la app usa webhooks en lugar de polling (eficiencia)
- Mostrar validación de integridad en impresión (robustez)
- Mostrar manejo de errores y estados de carga (UX)
- Mostrar responsividad en móvil (accesibilidad)
