"use client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { TableRow, TableCell } from "@/components/ui/table";
import { dateLabel } from "@/components/workshop-controls";
import type { OperationsView } from "@/domain/operations-view";
const money = (v: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(v));
const condition = (v: string) =>
  ({ NEW: "Nuevo", USED: "Usado", REBUILT: "Reconstruido" })[v] ?? v;
export function ItemDetail({
  item,
  data,
  locations,
  onClose,
  onEdit,
  onStock,
}: {
  item: OperationsView["items"][number] | undefined;
  data: OperationsView;
  locations: { id: string; name: string }[];
  onClose: () => void;
  onEdit: () => void;
  onStock: () => void;
}) {
  const service = item?.kind === "SERVICE";
  return (
    <Sheet
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="dossier-sheet">
        <SheetHeader>
          <SheetTitle>{item?.name ?? "Detalle del repuesto"}</SheetTitle>
          <SheetDescription>
            {service ? "Servicio del taller" : "Ficha del repuesto"} ·{" "}
            {item?.code}
          </SheetDescription>
        </SheetHeader>
        {item && (
          <div className="sheet-body">
            <div className="detail-actions">
              <Button variant="outline" onClick={onEdit}>
                {service ? "Editar servicio" : "Editar repuesto"}
              </Button>
              {!service && (
                <Button onClick={onStock}>Registrar movimiento</Button>
              )}
            </div>
            <dl className="detail-facts">
              <div>
                <dt>Código interno</dt>
                <dd>{item.code}</dd>
              </div>
              {!service && (
                <>
                  <div>
                    <dt>Referencia del fabricante</dt>
                    <dd>{item.reference || "Sin referencia registrada"}</dd>
                  </div>
                  <div>
                    <dt>Marca</dt>
                    <dd>{item.brand || "Sin marca registrada"}</dd>
                  </div>
                  <div>
                    <dt>Unidad</dt>
                    <dd>{item.unit}</dd>
                  </div>
                </>
              )}
            </dl>
            <section className="detail-section">
              <h3>
                {service ? "Alcance del servicio" : "Notas y compatibilidad"}
              </h3>
              <p className="whitespace-pre-wrap">
                {item.notes ||
                  (service
                    ? "Sin descripción registrada."
                    : "Sin notas registradas.")}
              </p>
            </section>
            {!service && (
              <Tabs defaultValue="stock">
                <TabsList aria-label="Detalle de inventario">
                  <TabsTrigger value="stock">Existencias</TabsTrigger>
                  <TabsTrigger value="offers">Proveedores</TabsTrigger>
                  <TabsTrigger value="movements">Movimientos</TabsTrigger>
                </TabsList>
                <TabsContent value="stock">
                  <DataTable
                    tableKey="stockDetail"
                    headers={[
                      "Sede",
                      "Condición",
                      "Cantidad",
                      "Reservado",
                      "Disponible",
                    ]}
                    empty="Este repuesto aún no tiene existencias."
                  >
                    {data.balances
                      .filter((b) => b.itemId === item.id)
                      .map((b) => (
                        <TableRow key={`${b.locationId}-${b.condition}`}>
                          <TableCell>
                            {locations.find((l) => l.id === b.locationId)?.name}
                          </TableCell>
                          <TableCell>{condition(b.condition)}</TableCell>
                          <TableCell>{b.quantity}</TableCell>
                          <TableCell>{b.reserved}</TableCell>
                          <TableCell>
                            {Number(b.quantity) - Number(b.reserved)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </DataTable>
                </TabsContent>
                <TabsContent value="offers">
                  <DataTable
                    tableKey="offersDetail"
                    headers={[
                      "Proveedor",
                      "Condición",
                      "Precio COP",
                      "Consulta",
                    ]}
                    empty="No hay precios de proveedores para este repuesto."
                  >
                    {data.offers
                      .filter((o) => o.itemId === item.id)
                      .map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            {
                              data.suppliers.find((s) => s.id === o.supplierId)
                                ?.name
                            }
                            <small className="cell-detail">{o.evidence}</small>
                          </TableCell>
                          <TableCell>{condition(o.condition)}</TableCell>
                          <TableCell>{money(o.unitCost)}</TableCell>
                          <TableCell>{dateLabel(o.observedAt)}</TableCell>
                        </TableRow>
                      ))}
                  </DataTable>
                </TabsContent>
                <TabsContent value="movements">
                  <DataTable
                    tableKey="movementsDetail"
                    headers={["Fecha", "Sede", "Cantidad", "Motivo"]}
                    empty="Este repuesto no tiene movimientos."
                  >
                    {data.movements
                      .filter((m) => m.itemId === item.id)
                      .map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>{dateLabel(m.date)}</TableCell>
                          <TableCell>
                            {locations.find((l) => l.id === m.locationId)?.name}
                          </TableCell>
                          <TableCell>{m.quantity}</TableCell>
                          <TableCell>
                            {m.reason}
                            {m.reversed ? " · Revertido" : ""}
                          </TableCell>
                        </TableRow>
                      ))}
                  </DataTable>
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
