# Diagramas de Mecanismos Manager

Actualizados el 11 de septiembre de 2026 con Archify. Reflejan el código local, incluidos cambios aún sin commit. Los pasos futuros se identifican como pendientes.

| Diagrama | Qué explica | Especificación |
| --- | --- | --- |
| [Arquitectura implementada](architecture.html) | Web/PWA, TanStack Query, Next.js, autenticación, Prisma y fotos privadas en PostgreSQL | [JSON](architecture.json) |
| [Modelo de datos actual](data-model.html) | Los 22 modelos agrupados y las relaciones comerciales que faltan | [JSON](data-model.json) |
| [Reparación](repair.html) | Recepción, diagnóstico, tareas, revisión y cierre operativo | [JSON](repair.json) |
| [Caja y transferencias](finance.html) | Registro, saldos, obligaciones y reversión de traslados | [JSON](finance.json) |
| [Reconstrucción propia](reconditioning.html) | Trabajo disponible y pasos pendientes para vender una unidad con trazabilidad | [JSON](reconditioning.json) |

El modelo agrupado muestra relaciones seleccionadas, sin pretender reemplazar el esquema Prisma. Los carriles de reparación distinguen etapas del trabajo; el cambio de estado de una orden lo realizan oficina/admin. El cierre no implica pago ni aceptación documentada de entrega. En reconstrucción, las conexiones hacia los pasos futuros son discontinuas.

Se retiraron afirmaciones de los diagramas anteriores que no correspondían al código: `/api/v1`, alojamiento ya activo en Vercel, archivos en Supabase Storage, PDF de Siigo, aplicación de cobros y garantías terminadas. El [informe de revisión](../platform-review-2026-09-11.md) desarrolla esas diferencias y propone el orden de implementación.

## Verificación

Cada HTML tiene un recibo `*.receipt.json` con tipo de diagrama, SHA-256 y bytes de la especificación y del artefacto. `.gitattributes` conserva finales de línea LF para que Git no cambie esos bytes en Windows. Los cinco pasan **9/9 comprobaciones showcase, con 0 errores y 0 advertencias**.

`*.visual-check.json` registra la prueba automatizada en Chrome de ese mismo artefacto: 1440×900, 1600×1000, 1920×1080 y 2048×1320; capturas claras/oscuras en las resoluciones extremas. Los cinco pasan sin desbordamiento del documento. El campo `visualReview: pending` pertenece a esa herramienta y no representa una revisión perceptual.

La revisión perceptual se registra aparte en [visual-review.json](visual-review.json), vinculada a los hashes finales. Comprueba el recorrido, textos, conexiones, contraste y composición mediante las capturas. No se probaron los controles interactivos de exportación, búsqueda o presentación.

El contenido y las categorías están en español. Archify solo admite `en` y `zh-CN` para la interfaz fija; se conserva el fallback inglés en controles como Light, Export y Legend y en el atributo `lang` del visor.

Para regenerar un diagrama después de editar su JSON:

```powershell
node C:/Users/andre/.agents/skills/archify/bin/archify.mjs validate architecture docs/diagrams/architecture.json --quality showcase --json
node C:/Users/andre/.agents/skills/archify/bin/archify.mjs deliver architecture docs/diagrams/architecture.json docs/diagrams/architecture.html --quality showcase --json
node C:/Users/andre/.agents/skills/archify/bin/archify.mjs visual-check docs/diagrams/architecture.html --json
```

Guardar el nuevo recibo de entrega y revisar las capturas antes de actualizar la revisión perceptual. Para reparación, caja y reconstrucción, usar el tipo `workflow`. Los PNG se regeneran con `visual-check` y están excluidos de Git; no editar el HTML generado.
