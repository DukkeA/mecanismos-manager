# Mecanismos Manager

Aplicación interna de Mecanismos Técnicos SAS. Bogotá, COP, dos sedes.

## Estado

Disponible para pruebas locales: cotizaciones, ventas, cartera, compras, inventario, órdenes, tareas, garantías, unidades propias, costos y control de caja. Incluye 58 modelos privados, 19 migraciones locales y cinco diagramas Archify. Los datos ficticios persisten en Docker. Con los accesos locales habilitados, `/login` permite elegir administración, oficina o mecánico; `/` valida la sesión y `/demo` redirige a este flujo.

**El acceso remoto sigue pendiente**: Google, credenciales y Storage de producción, despliegue HTTPS e instalación PWA deben comprobarse antes de usarla como registro principal. El [estado de implementación](docs/implementation-status.md) detalla resultados y límites; el [manual del piloto](docs/pilot-runbook.md) contiene recorridos de prueba, preparación de datos y recuperación. Los [diagramas](docs/diagrams/README.md) describen la arquitectura y los registros internos; los [recorridos simplificados](docs/workflows-simplified.md) describen la navegación y las acciones actuales.

## Desarrollo reproducible

Requisitos: Node 24, pnpm 11.5.2 y Docker.

1. `pnpm install`
2. `pnpm dlx supabase@2.116.0 start -x realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor`
3. `pnpm dlx supabase@2.116.0 migration up --local` y `node scripts/setup-local.mjs` para aplicar migraciones y crear `.env.local` con el rol local dedicado. Conserva archivos existentes; no imprime secretos.
4. `pnpm db:generate`, `pnpm db:seed:local`, `pnpm db:storage:local`, `pnpm db:migrate:photos:local`, `pnpm db:seed:commerce`, `pnpm db:seed:control`, `pnpm db:seed:team`, `pnpm db:seed:attendance`, `pnpm db:seed:benefits` y `pnpm db:seed:supports`.
5. `pnpm test` y `pnpm typecheck`
6. `node scripts/verify-db.mjs` y `pnpm test:integration`
7. `pnpm dev`, abrir http://localhost:3100/login

`pnpm build` verifica la compilación de producción. El manifiesto y service worker están incluidos; este último se registra solo en producción. Su caché contiene exclusivamente la página de desconexión y tres iconos, nunca órdenes, clientes o respuestas de API. La caída de red muestra una pantalla de reconexión y no confirma escrituras sin conexión. Esto prepara la PWA; no equivale a una APK firmada ni a una prueba de instalación en un teléfono.

La instancia usa puertos 56320–56329. Desarrollo usa 3100; la vista previa de producción usa 3101. Nunca detener ni reinicializar las instancias de otros proyectos. `supabase db reset --local` borra únicamente los datos de esta instancia y debe reservarse para desarrollo desechable.

## Migraciones y seguridad

Supabase mantiene el historial SQL en `supabase/migrations`; Prisma genera el cliente y describe las tablas, sin un segundo historial de migraciones. Las restricciones SQL adicionales se conservan al generar futuras diferencias.

El esquema `workshop` no se expone mediante PostgREST y revoca el acceso de `anon` y `authenticated`. El backend valida la identidad con Supabase Auth y consulta permisos desde miembros autorizados en la base de datos. El rol `workshop_runtime` limita escrituras: los movimientos y auditorías solo admiten inserción/lectura. Está configurado localmente; su contraseña y LOGIN cloud están pendientes. El usuario postgres se reserva para migraciones y pruebas locales.

El primer acceso vincula una identidad de correo verificado a una invitación preexistente. No hay autorregistro como administrador ni permisos derivados de `user_metadata`. Equipo permite autorizar correos y gestionar roles; no envía invitaciones por email. Dos administradores iniciales ya están autorizados; Google aún debe configurarse y probarse. El proxy renueva las cookies de sesión antes de renderizar.

## Diseño y alcance

Consultar `PRODUCT.md`, [estado de implementación](docs/implementation-status.md) y los visores de `docs/diagrams`. Los datos y recorridos actuales están en [el manual del piloto](docs/pilot-runbook.md); [local-testing.md](docs/local-testing.md) conserva los casos iniciales. El juego ficticio se carga solo en Docker. Los cambios de texto están en [docs/copy-review.md](docs/copy-review.md).

El proyecto remoto Supabase es `msocvkzvrwpsdlwzsrin`, en Dukke. Su creación se confirmó en USD 0/mes. El 11 de septiembre se verificaron 13 migraciones, 47 tablas privadas, dos administradores y ninguna orden en cloud. La configuración pendiente está en [docs/cloud-setup.md](docs/cloud-setup.md). No hay despliegue Vercel ni APK completados.

La organización de Inventario, vehículos y componentes, salarios y horas extra está documentada en [Inventario y Equipo](docs/inventory-and-team.md). Esta ampliación y su migración se aplicaron solo en local.

Bonos fijos, asistencia por QR y resultados por producto: [uso, cálculos y configuración pendiente](docs/bonuses-attendance-and-results.md). Carga local adicional: `pnpm db:seed:attendance`.

Permisos con descuento salarial o de vacaciones, anticipos en cuotas y horario de sábado: [uso y cálculos](docs/employee-permissions-and-advances.md). Seed adicional: `pnpm db:seed:benefits`.
