# Diagramas de Mecanismos Manager

Arquitectura, datos y caja actualizados con Archify el 12 de septiembre de 2026. Describen la implementación actual; Google, despliegue y APK siguen pendientes de configuración y comprobación. El [estado de implementación](../implementation-status.md) registra las verificaciones de aplicación y cloud por separado.

| Diagrama | Contenido | Especificación |
| --- | --- | --- |
| [Arquitectura](architecture.html) | PWA, TanStack Query, Next.js, permisos, Prisma y Storage privado | [JSON](architecture.json) |
| [Modelo de datos](data-model.html) | 58 modelos agrupados y relaciones seleccionadas | [JSON](data-model.json) |
| [Reparación](repair.html) | Recepción, acuerdo comercial, ejecución, pruebas, entrega y garantía | [JSON](repair.json) |
| [Caja](finance.html) | Cobros aplicados a ventas, pagos, cuentas, transferencias y cierres | [JSON](finance.json) |
| [Reconstrucción propia](reconditioning.html) | Identificación, costos, unidad vendible, venta y devolución | [JSON](reconditioning.json) |

El mapa agrupado no sustituye las claves y restricciones de [schema.prisma](../../prisma/schema.prisma) y las migraciones SQL. Cerrar una reparación exige pruebas aprobadas y constancia de entrega; no obliga a que la venta esté pagada. Una unidad propia conserva un flujo distinto de las piezas del cliente en custodia.

## Inventario de modelos

| Grupo | Modelos |
| --- | --- |
| Identidad y equipo | `Member`, `TaskAssignment` |
| Permisos y anticipos | `EmployeeLeave`, `EmployeeLeaveDay`, `VacationAdjustment`, `SalaryAdvance`, `AdvanceInstallment` |
| Asistencia | `WorkshopSettings`, `AttendanceStation`, `AttendanceShift`, `AttendanceScan` (y horarios previos archivados en `AttendanceSchedule`) |
| Clientes y activos | `Customer`, `Asset`, `OrderAsset`, `AssetOwnership` |
| Trabajo | `WorkOrder`, `Observation`, `Task`, `TaskNote`, `TaskPhoto`, `TimeEntry` |
| Catálogo, categorías y sedes | `CatalogItem`, `BusinessCategory`, `SupplierCategory`, `Location` |
| Inventario | `StockBalance`, `StockMovement`, `StockReservation`, `StockTransfer`, `InventoryCount`, `SerializedUnit` |
| Proveedores y compras | `Supplier`, `SupplierOffer`, `Purchase`, `PurchaseLine`, `PurchaseReceipt`, `SupplierPayment` |
| Cotizaciones y ventas | `Quote`, `QuoteLine`, `Sale`, `SaleLine`, `SaleReturn`, `SaleReturnLine` |
| Cartera | `CustomerPayment`, `PaymentAllocation` |
| Costos y calidad | `LaborRate`, `OvertimeEntry`, `WarrantyCase`, `OrderCheck`, `OrderHandover` |
| Caja | `MoneyAccount`, `Obligation`, `CashEntry`, `CashClosure`, `RecurringExpense`, `MonthCoverage` |
| Evidencia y auditoría | `Attachment`, `AuditEvent`, `CommandReceipt` |

## Verificación

Cada HTML tiene un recibo `*.receipt.json` con tipo de diagrama, SHA-256 y bytes de la especificación y del artefacto. `.gitattributes` conserva finales de línea LF para que Git no cambie esos bytes en Windows. Los cinco pasan **9/9 comprobaciones showcase, con 0 errores y 0 advertencias**.

La revisión perceptual se registra en [visual-review.json](visual-review.json). Para arquitectura, datos y caja, las capturas anteriores corresponden a otros hashes y **no verifican el contenido actual**. El navegador bloqueó el acceso a archivos locales en la revisión anterior; no se intentó una vía alternativa. Los tres artefactos actualizados pasan las comprobaciones estructurales y quedan pendientes de revisión visual. Reparación y reconstrucción conservan su evidencia anterior.

El contenido y las categorías están en español. Archify solo admite `en` y `zh-CN` para la interfaz fija; se conserva el fallback inglés en controles como Light, Export y Legend y en el atributo `lang` del visor.

Para regenerar un diagrama después de editar su JSON:

```powershell
node C:/Users/andre/.agents/skills/archify/bin/archify.mjs validate architecture docs/diagrams/architecture.json --quality showcase --json
node C:/Users/andre/.agents/skills/archify/bin/archify.mjs deliver architecture docs/diagrams/architecture.json docs/diagrams/architecture.html --quality showcase --json
node C:/Users/andre/.agents/skills/archify/bin/archify.mjs visual-check docs/diagrams/architecture.html --json
```

Guardar el nuevo recibo de entrega y revisar las capturas antes de actualizar la revisión perceptual. Para reparación, caja y reconstrucción, usar el tipo `workflow`. Los PNG se regeneran con `visual-check` y están excluidos de Git; no editar el HTML generado.

El modelo incluye las condiciones salariales mensuales en `LaborRate` y `OvertimeEntry`. Consulta [Inventario y Equipo](../inventory-and-team.md) para las fórmulas y la relación con Dinero.

La arquitectura y el modelo de datos incorporan bonos, horario global y pantallas QR (58 modelos). Ambas entregas pasan 9/9 controles deterministas. El navegador bloqueó la apertura del archivo local; no se repitió la revisión perceptual de este HTML ni se reutilizó como evidencia la captura de la versión anterior.

La clasificación por categorías y sus referencias históricas en cotizaciones y ventas se describen en [Categorías del taller](../business-categories.md). Arquitectura y modelo de datos reflejan esta ampliación a 63 modelos.
