# Diagramas de Mecanismos Manager

Los diagramas describen la arquitectura y los flujos implementados. Las especificaciones JSON se editan con [Archify](https://github.com/tt-a1i/archify); los HTML son visores independientes con zoom, búsqueda y temas claro y oscuro.

![Arquitectura de la aplicación](architecture.png)

| Diagrama | Contenido | Fuente | Visor |
| --- | --- | --- | --- |
| Arquitectura | Next.js en Vercel, Google OAuth, PostgreSQL y Storage privado. | [JSON](architecture.json) | [HTML](architecture.html) |
| Modelo de datos | 63 modelos agrupados y sus relaciones principales. | [JSON](data-model.json) | [HTML](data-model.html) |
| Reparación | Recepción, acuerdo comercial, ejecución, pruebas y entrega. | [JSON](repair.json) | [HTML](repair.html) |
| Dinero | Cobros, pagos, transferencias, salarios, anticipos y cierres. | [JSON](finance.json) | [HTML](finance.html) |
| Reconstrucción propia | Identificación, costos, unidad vendible, venta y devolución. | [JSON](reconditioning.json) | [HTML](reconditioning.html) |

GitHub muestra las imágenes y el código fuente de los HTML. Para abrir los visores interactivos, clonar el repositorio y servir esta carpeta, por ejemplo:

```powershell
python -m http.server 3190 --bind 127.0.0.1 --directory docs/diagrams
```

Abrir [el visor de arquitectura](http://127.0.0.1:3190/architecture.html). El contenido está en español; los controles fijos de Archify están en inglés.

## Actualización

El [esquema Prisma](../../prisma/schema.prisma) y las [migraciones SQL](../../supabase/migrations) son la referencia para tablas, relaciones, restricciones y permisos. El mapa agrupado no reemplaza esos archivos.

Con Archify instalado, definir su ruta y validar después de editar el JSON:

```powershell
$archify = "C:/ruta/a/archify/bin/archify.mjs"
node $archify validate architecture docs/diagrams/architecture.json --quality showcase --json
node $archify deliver architecture docs/diagrams/architecture.json docs/diagrams/architecture.html --quality showcase --json
```

Arquitectura y modelo de datos usan el tipo `architecture`. Los otros tres usan `workflow`. Editar siempre la fuente JSON y regenerar el HTML. Actualizar también la imagen cuando cambie su contenido.

La validación showcase exige nueve comprobaciones, sin errores ni advertencias. Revisar por separado legibilidad, conexiones y recortes en el navegador. Los recibos y capturas temporales permanecen fuera de Git; no son dependencias de la aplicación.
