# Rentabilidad conectada

Revisión del 24 de septiembre de 2026. Entorno de prueba local, datos ficticios.

## Diagnóstico

1. El resumen principal explica liquidez y pagos de gastos, pero no el resultado del negocio. Evidencia visual: `../audits/profitability/01-resumen-antes.png`.
2. Rentabilidad mezcla productos, garantías, mecánicos y órdenes en una página larga; los filtros y las fechas no representan lo mismo. Evidencia: `../audits/profitability/02-rentabilidad-antes.png`.
3. `hub-query`, `product-results`, `management-report` y `job-service.orderCost` calculan por separado. Los informes por producto excluyen garantías; una tarea sin tiempo parece gratuita; una reversión de consumo desconocido deja el costo incompleto para siempre.
4. Una venta de reparación no comprueba que se hayan consumido los repuestos facturados. Una venta de servicio sin orden no tiene dónde atribuir trabajo real.
5. Las obligaciones y los gastos pagados no pueden atribuirse a una orden. Los pagos de compras no deben descontarse de nuevo después de consumir el inventario.
6. La nómina usa salarios, novedades y anticipos. Restar a la vez toda la nómina y la mano de obra atribuida duplica el costo; descontar anticipos del costo laboral también lo distorsiona.
7. Una reconstrucción propia acumula inversión y solo produce ventas al venderse. Su costo completo debe conservarse incluso después de devolver o anular la venta.

## Modelo

### Resultado del trabajo o venta

Venta neta (descuentos y devoluciones) menos repuestos consumidos, trabajo registrado, gastos directos y garantías asumidas. Un único cálculo alimenta orden, venta, productos, categorías e informe gerencial.

Las horas de las tareas se valorizan con la tarifa vigente en la fecha trabajada. Son una atribución interna del costo del personal, no un segundo pago. Una garantía pendiente mantiene el resultado provisional; una aceptada descuenta su costo al negocio original. Una rechazada con venta propia atribuye el costo al trabajo cobrado; sin venta sigue mostrando el costo asumido, sin ocultarlo. Una devolución de servicio no recupera trabajo ya realizado.

Mostrar costos conocidos, pendientes específicos y estado: sin venta, en curso, datos pendientes o resultado completo. No inventar horas ni costos. Los trabajos cancelados conservan sus costos. La custodia del cliente nunca entra al inventario vendible.

### Resultado mensual de gestión

Ventas emitidas en el mes menos devoluciones del mes, repuestos reconocidos en el mes, salarios devengados (antes de descontar anticipos), extras y gastos del mes. El pago de una obligación no vuelve a generar un gasto. Compras, abonos, anticipos, préstamos, aportes, retiros y transferencias se consultan en Dinero y no se convierten en utilidad.

Repuestos de reparaciones pendientes de vender permanecen como trabajo en curso. Se reconocen al vender; consumos posteriores se reconocen cuando ocurren. Las garantías y pérdidas de inventario se reconocen al ocurrir. La reconstrucción reconoce núcleo y materiales al vender; salarios y gastos adicionales se reconocen en su mes. Este es un resultado de gestión, no un estado fiscal ni un balance contable. No capitaliza salarios. Se explica esa diferencia frente al margen completo de la unidad.

La nómina salarial viene del cálculo existente de Equipo. Los aportes y prestaciones se toman de las obligaciones PAYROLL, para no sumar también la estimación de cargas incluida en la tarifa horaria. Si faltan salarios, costos de inventario, desgloses históricos o revisión del mes, el resultado es provisional, con importe conocido y motivos visibles.

### Uso diario

1. Recibir el trabajo o registrar la venta. Si se vende mano de obra sin orden, crear automáticamente la orden y sus tareas, conservando cliente, categoría y responsables.
2. Registrar repuestos y tiempo una vez. Al vender una reparación, completar solamente los consumos facturados que aún falten; no repetir consumos anteriores ni reservas consumidas.
3. Registrar un gasto indicando opcionalmente a qué trabajo pertenece. Su pago se registra desde el gasto existente.
4. Abrir la garantía desde su venta; heredar la relación y actualizar automáticamente los resultados.
5. Consultar una pantalla inicial con el resultado mensual y una lista de pendientes con acceso al registro que los resuelve.

## Implementación y verificación

- Unidad 1: fuentes comunes de costos/resultados, relaciones de gastos y desglose de reconstrucciones; pruebas de conciliación y migración aditiva.
- Unidad 2: automatización de ventas, consumos y seguimiento de trabajo; pruebas transaccionales, idempotencia, reversión y permisos.
- Unidad 3: resumen mensual, detalle contextual y navegación de pendientes; pruebas de períodos, nómina y no duplicación, navegador de escritorio y móvil.
- Reversión: retirar la nueva UI y los nuevos lectores junto con las automatizaciones de cada unidad; las columnas añadidas son compatibles y los movimientos auditados se conservan. No borrar movimientos para revertir un despliegue.
- No migrar ni reescribir datos remotos durante esta revisión. La entrega local incluye migración reproducible y resultados de pruebas.

## Límites que requieren datos reales

Implementación local completada. La revisión, las capturas y la verificación final están en [el informe de auditoría](../audits/profitability/README.md). Se verificaron 68 pruebas unitarias, 123 pruebas de integración, compilación y flujos de navegador con guardar/reabrir. No se desplegó a producción.

Los gastos de importación deben incluirse en el costo unitario recibido, distribuidos entre repuestos; si se registran además como gasto corriente se duplican. No inferir aranceles, IVA descontable, depreciaciones ni costos ausentes. La revisión mensual confirma que se registraron los gastos relevantes; no demuestra por sí sola que los datos históricos sean completos. La clasificación laboral y tributaria sigue la configuración del negocio, no nuevas reglas legales supuestas.
