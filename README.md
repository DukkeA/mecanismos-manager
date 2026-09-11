# Mecanismos Manager

Aplicación interna de Mecanismos Técnicos SAS. Bogotá, COP, dos sedes.

## Estado

Implementación en curso. Incluye cinco diagramas Archify, 22 modelos privados, roles, órdenes y tareas con notas/fotos/historial, clientes, proveedores y precios fechados, inventario valorizado y caja con obligaciones y transferencias entre cuentas. El entorno local tiene datos ficticios persistentes en Docker. Con los accesos locales habilitados, `/login` permite elegir administración, oficina o mecánico; `/` valida su sesión y `/demo` redirige a este flujo.

**Todavía no está lista para el piloto completo**: faltan cotizaciones, ventas y aplicación de cobros, garantías, unidades serializadas, rentabilidad, importaciones, acceso Google real y despliegue público. La [revisión del 11 de septiembre](docs/platform-review-2026-09-11.md) propone las siguientes entregas y cómo comprobarlas. Los [diagramas actualizados](docs/diagrams/README.md) distinguen el código disponible de los flujos pendientes.

## Desarrollo reproducible

Requisitos: Node 24, pnpm 11.5.2 y Docker.

1. `pnpm install`
2. `pnpm dlx supabase@2.116.0 start -x realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor`
3. Ejecutar `node scripts/setup-local.mjs` para crear `.env.local` con el rol local dedicado. Conserva archivos existentes; no imprime secretos.
4. `pnpm db:generate` y `pnpm db:seed:local`
5. `pnpm test` y `pnpm typecheck`
6. `node scripts/verify-db.mjs` y `pnpm test:integration`
7. `pnpm dev`, abrir http://localhost:3100/login

`pnpm build` verifica la compilación de producción. El manifiesto y service worker están incluidos; este último se registra solo en producción. Su caché contiene exclusivamente la página de desconexión y tres iconos, nunca órdenes, clientes o respuestas de API. La caída de red muestra una pantalla de reconexión y no confirma escrituras sin conexión. Esto prepara la PWA; no equivale a una APK firmada ni a una prueba de instalación en un teléfono.

La instancia usa puertos 56320–56329. Desarrollo usa 3100; la vista previa de producción usa 3101. Nunca detener ni reinicializar las instancias de otros proyectos. `supabase db reset --local` borra únicamente los datos de esta instancia y debe reservarse para desarrollo desechable.

## Migraciones y seguridad

Supabase mantiene el historial SQL en `supabase/migrations`; Prisma genera el cliente y describe las tablas, sin un segundo historial de migraciones. Las restricciones SQL adicionales se conservan al generar futuras diferencias.

El esquema `workshop` no se expone mediante PostgREST y revoca el acceso de `anon` y `authenticated`. El backend valida la identidad con Supabase Auth y consulta permisos desde miembros autorizados en la base de datos. El rol `workshop_runtime` limita escrituras: los movimientos y auditorías solo admiten inserción/lectura. Está configurado localmente; su contraseña y LOGIN cloud están pendientes. El usuario postgres se reserva para migraciones y pruebas locales.

El primer acceso vincula una identidad de correo verificado a una invitación preexistente. No hay autorregistro como administrador ni permisos derivados de `user_metadata`. Equipo permite autorizar correos y gestionar roles; no envía invitaciones por email. Falta autorizar los tres administradores iniciales y probar Google de extremo a extremo. El proxy renueva las cookies de sesión antes de renderizar.

## Diseño y alcance

Consultar `PRODUCT.md`, `docs/implementation-status.md` y los visores de `docs/diagrams`. Los datos locales y recorridos de prueba están en [docs/local-testing.md](docs/local-testing.md). La base remota conserva únicamente las sedes; el juego ficticio se carga solo en Docker. Los cambios de texto están en [docs/copy-review.md](docs/copy-review.md).

El proyecto remoto Supabase registrado es `msocvkzvrwpsdlwzsrin`, en Dukke. Su creación se confirmó en USD 0/mes; el último registro remoto corresponde a las tres migraciones iniciales y 20 tablas. El repositorio contiene ahora siete migraciones y 22 modelos. No se volvió a consultar cloud en la revisión del 11 de septiembre: hay que verificar y aplicar las migraciones posteriores antes de desplegar. La configuración pendiente está en [docs/cloud-setup.md](docs/cloud-setup.md). No hay despliegue Vercel ni APK documentados como completados.
