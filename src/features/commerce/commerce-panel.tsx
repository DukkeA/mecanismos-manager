"use client";
import { Attachments } from "@/features/control/attachments";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  ArrowUpDown,
  MoreVertical,
  Pencil,
  Check,
  ReceiptText,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { useCommercialPage, useCommercialCommand } from "./hooks";
import { DocumentEditor } from "./document-editor";
import { FormSheet } from "@/components/form-sheet";
import {
  OperationForm,
  type Dialog,
  type FormField,
} from "@/components/operation-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Choice,
  DateRangePicker,
  dateLabel,
} from "@/components/workshop-controls";
import { cop, todayInBogota } from "@/features/cash/summary";
import type { CommercialRow } from "@/domain/commercial";
import type { OperationsView } from "@/domain/operations-view";
import type { OrderView } from "@/domain/workshop-view";
import type { Role } from "@/domain/permissions";

const statuses: Record<string, string> = {
  DRAFT: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "No aprobada",
  ISSUED: "Vigente",
  VOID: "Anulada",
  RECEIVED: "Recibido",
  REVERSED: "Revertido",
};
export function CommercePanel({
  section,
  data,
  orders,
  locations,
  role,
}: {
  section: string;
  data: OperationsView;
  orders: OrderView[];
  locations: { id: string; name: string }[];
  role: Role;
}) {
  const resource =
    section === "Cotizaciones"
      ? "quotes"
      : section === "Ventas"
        ? "sales"
        : "payments";
  const params = useSearchParams(),
    queryParams = new URLSearchParams({ resource });
  for (const key of [
    "q",
    "status",
    "page",
    "pageSize",
    "orderBy",
    "direction",
    "from",
    "to",
  ])
    if (params.get(key)) queryParams.set(key, params.get(key)!);
  const query = useCommercialPage(queryParams),
    command = useCommercialCommand();
  const [selected, setSelected] = useState<CommercialRow | null>(null),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [editor, setEditor] = useState<{
      mode: "quote" | "sale";
      source?: CommercialRow;
    } | null>(null);
  function filter(values: Record<string, string>) {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in values)) next.delete("page");
    window.history.replaceState(null, "", `?${next}`);
  }
  function form(value: Dialog) {
    setDialog(value);
  }
  const account: FormField = {
    key: "accountId",
    label: "Cuenta",
    type: "select",
    options: data.accounts.map((a) => ({
      id: a.id,
      label: `${a.name} · ${cop(a.balance)}`,
    })),
  };
  const amount: FormField = {
    key: "amount",
    label: "Importe (COP)",
    type: "money",
  };
  const note: FormField = {
    key: "note",
    label: "Observación",
    type: "textarea",
  };
  const reason: FormField = {
    key: "reason",
    label: "Motivo",
    type: "textarea",
  };
  const occurred: FormField = {
    key: "occurredOn",
    label: "Fecha",
    type: "date",
  };
  function payment(row?: CommercialRow) {
    form({
      kind: "payment",
      title: row ? `Abonar a venta ${row.number}` : "Recibir anticipo",
      submitLabel: "Registrar cobro",
      extra: {
        customerId: row?.customerId,
        saleId: row?.id,
        amount: row?.balance,
        occurredOn: todayInBogota(),
      },
      fields: [
        ...(!row
          ? [
              {
                key: "customerId",
                label: "Cliente",
                type: "select" as const,
                options: data.customers
                  .filter((c) => !c.deletedAt)
                  .map((c) => ({ id: c.id, label: c.name })),
              },
            ]
          : []),
        account,
        amount,
        occurred,
        { key: "reference", label: "Referencia del pago", optional: true },
        note,
      ],
    });
  }
  function actions(row: CommercialRow) {
    const list: { label: string; run: () => void; danger?: boolean }[] = [];
    if (resource === "quotes") {
      list.push({
        label: "Crear nueva versión",
        run: () => {
          setSelected(null);
          setEditor({ mode: "quote", source: row });
        },
      });
      if (row.status === "DRAFT")
        list.push({
          label: "Registrar decisión",
          run: () =>
            form({
              kind: "quote-decision",
              title: "Decisión del cliente",
              submitLabel: "Guardar decisión",
              extra: { quoteId: row.id },
              fields: [
                {
                  key: "decision",
                  label: "Decisión",
                  type: "select",
                  options: [
                    { id: "APPROVED", label: "Aprobada" },
                    { id: "REJECTED", label: "No aprobada" },
                  ],
                },
                { key: "approvedBy", label: "Nombre de quien responde" },
                {
                  key: "note",
                  label: "Medio, fecha y condiciones de la respuesta",
                  type: "textarea",
                },
              ],
            }),
        });
      if (row.status === "APPROVED" && !row.saleId)
        list.push({
          label: "Registrar venta",
          run: () => {
            setSelected(null);
            setEditor({ mode: "sale", source: row });
          },
        });
    }
    if (resource === "sales" && row.status === "ISSUED") {
      if (Number(row.balance) > 0)
        list.push({ label: "Registrar abono", run: () => payment(row) });
      if (role === "ADMIN") {
        list.push({
          label: "Registrar devolución",
          run: () =>
            form({
              kind: "sale-return",
              title: "Devolución de venta",
              description:
                "Se acreditará el valor y se reintegrará el stock vendido por mostrador. El saldo a favor puede devolverse desde Cartera.",
              extra: { saleId: row.id, occurredOn: todayInBogota() },
              fields: [
                {
                  key: "saleLineId",
                  label: "Línea",
                  type: "select",
                  options: (row.lines ?? [])
                    .filter(
                      (l) =>
                        Number(l.quantity) > Number(l.returnedQuantity ?? 0),
                    )
                    .map((l) => ({
                      id: l.id,
                      label: `${l.description} · ${l.quantity} vendidos, ${l.returnedQuantity ?? 0} devueltos`,
                    })),
                },
                {
                  key: "quantity",
                  label: "Cantidad a devolver",
                  type: "quantity",
                },
                occurred,
                reason,
              ],
            }),
        });
        list.push({
          label: "Anular venta",
          danger: true,
          run: () =>
            form({
              kind: "sale-void",
              title: "Anular venta",
              description:
                "Los cobros quedarán a favor del cliente. Se restaurará el stock de mostrador aún no devuelto y se conservará la historia.",
              submitLabel: "Anular venta",
              extra: { saleId: row.id },
              fields: [reason],
            }),
        });
      }
    }
    if (resource === "payments" && row.status === "RECEIVED") {
      if (Number(row.available) > 0) {
        list.push({
          label: "Aplicar a una venta",
          run: () => {
            setSelected(row);
            form({
              kind: "payment-apply",
              title: "Aplicar saldo disponible",
              description:
                "La aplicación reduce la deuda; no registra otra entrada a caja.",
              extra: { paymentId: row.id },
              fields: [
                {
                  key: "saleId",
                  label: "Venta del cliente",
                  type: "select",
                  options: [],
                },
                amount,
                note,
              ],
            });
          },
        });
        if (role === "ADMIN")
          list.push({
            label: "Devolver saldo a favor",
            run: () =>
              form({
                kind: "payment-refund",
                title: "Devolver dinero al cliente",
                extra: { paymentId: row.id, occurredOn: todayInBogota() },
                fields: [account, amount, occurred, reason],
              }),
          });
      }
      if (role === "ADMIN")
        list.push({
          label: "Revertir cobro",
          danger: true,
          run: () =>
            form({
              kind: "payment-reverse",
              title: "Revertir cobro",
              extra: { entryId: row.entryId, occurredOn: todayInBogota() },
              fields: [occurred, reason],
            }),
        });
    }
    return list;
  }
  const displayedDialog = dialog?.kind === "payment-apply" ? {...dialog,fields:dialog.fields.map(f=>f.key === "saleId" ? {...f,type:"sale" as const,customerId:selected?.customerId}:f)} : dialog;
  const page = query.data?.page ?? 1,
    pages = Math.max(
      1,
      Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 10)),
    );
  function sort(key: string) {
    filter({
      orderBy: key,
      direction:
        params.get("orderBy") === key && params.get("direction") === "asc"
          ? "desc"
          : "asc",
    });
  }
  return (
    <div className="flex flex-col gap-5">
      {query.data && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Por cobrar", query.data.summary.receivable],
            ["Saldos a favor", query.data.summary.advances],
            ["Ventas vigentes, menos devoluciones", query.data.summary.sales],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader>
                <CardTitle className="text-sm">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <strong className="text-2xl tabular-nums">{cop(value)}</strong>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Input
            aria-label="Buscar documentos"
            placeholder="Buscar cliente, descripción o número"
            value={params.get("q") ?? ""}
            onChange={(e) => filter({ q: e.target.value })}
          />
        </div>
        {resource !== "payments" && (
          <div className="w-44">
            <Choice
              label="Estado"
              value={params.get("status") ?? ""}
              onChange={(v) => filter({ status: v })}
              options={[
                { id: "", label: "Todos los estados" },
                ...(resource === "quotes"
                  ? ["DRAFT", "APPROVED", "REJECTED"]
                  : ["ISSUED", "VOID"]
                ).map((s) => ({ id: s, label: statuses[s] })),
              ]}
            />
          </div>
        )}
        <DateRangePicker
          from={params.get("from") ?? ""}
          to={params.get("to") ?? ""}
          onChange={(from, to) => filter({ from, to })}
        />
        {(params.get("q") ||
          params.get("status") ||
          params.get("from") ||
          params.get("to")) && (
          <Button
            variant="ghost"
            onClick={() => filter({ q: "", status: "", from: "", to: "" })}
          >
            Limpiar
          </Button>
        )}
        <Button
          onClick={() =>
            resource === "payments"
              ? payment()
              : setEditor({ mode: resource === "quotes" ? "quote" : "sale" })
          }
        >
          <Plus data-icon="inline-start" />
          {resource === "quotes"
            ? "Nueva cotización"
            : resource === "sales"
              ? "Nueva venta"
              : "Recibir anticipo"}
        </Button>
      </div>
      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>{query.error.message}</AlertTitle>
          <Button variant="outline" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </Alert>
      )}
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="data-panel">
          {query.data?.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    ["number", "Documento"],
                    ["customer", "Cliente"],
                    ["date", "Fecha"],
                    ["", "Estado"],
                    ["total", "Total"],
                    ["", "Pendiente / disponible"],
                    ["", "Acciones"],
                  ].map(([key, label]) => (
                    <TableHead key={label}>
                      {key ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => sort(key)}
                        >
                          {label}
                          <ArrowUpDown data-icon="inline-end" />
                        </Button>
                      ) : (
                        label
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Button variant="link" onClick={() => setSelected(row)}>
                        {row.number
                          ? `${resource === "quotes" ? "COT" : "VTA"}-${row.number}`
                          : row.title}
                      </Button>
                      <div className="max-w-72 truncate text-sm text-muted-foreground">
                        {row.number ? row.title : ""}
                        {row.revision ? ` · versión ${row.revision}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell>
                      {dateLabel(row.date)}
                      {row.dueOn && (
                        <div className="text-xs text-muted-foreground">
                          Vence {dateLabel(row.dueOn)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "APPROVED" || row.status === "RECEIVED"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {statuses[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {cop(row.total)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {resource === "quotes" ? "—" : cop(row.balance)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Acciones ${row.number ?? row.title}`}
                          >
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => setSelected(row)}>
                              Ver detalle
                            </DropdownMenuItem>
                            {actions(row).map((a) => (
                              <DropdownMenuItem
                                key={a.label}
                                variant={a.danger ? "destructive" : "default"}
                                onSelect={a.run}
                              >
                                {a.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No hay documentos</EmptyTitle>
                <EmptyDescription>
                  {params.get("q")
                    ? "Prueba otra búsqueda o limpia los filtros."
                    : "Registra el primer documento para comenzar."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <div className="flex items-center justify-between gap-3 border-t p-3">
            <span className="text-sm text-muted-foreground">
              {query.data?.total ?? 0} registros · Página {page} de {pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || query.isFetching}
                onClick={() => filter({ page: String(page - 1) })}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={page >= pages || query.isFetching}
                onClick={() => filter({ page: String(page + 1) })}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      )}
      <Sheet
        open={!!selected && !dialog}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
            <SheetDescription>
              {selected?.customer}
              {selected?.revision ? ` · Versión ${selected.revision}` : ""}
              {selected?.orderNumber ? ` · OT-${selected.orderNumber}` : ""}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="sheet-body flex flex-col gap-5">
              <div className="flex flex-wrap gap-2">
                {actions(selected).map((a) => (
                  <Button
                    key={a.label}
                    variant={a.danger ? "destructive" : "outline"}
                    onClick={a.run}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt>Total</dt>
                  <dd className="text-xl font-semibold">
                    {cop(selected.total)}
                  </dd>
                </div>
                <div>
                  <dt>
                    {resource === "payments" ? "Disponible" : "Pendiente"}
                  </dt>
                  <dd className="text-xl font-semibold">
                    {cop(selected.balance)}
                  </dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{dateLabel(selected.date)}</dd>
                </div>
                {selected.dueOn && (
                  <div>
                    <dt>Vencimiento</dt>
                    <dd>{dateLabel(selected.dueOn)}</dd>
                  </div>
                )}
              </dl>
              {selected.approvedBy && (
                <p>
                  Respuesta de {selected.approvedBy}: {selected.approvalNote}
                </p>
              )}
              {selected.invoiceReference && (
                <p>Factura: {selected.invoiceReference}</p>
              )}
              {selected.lines && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Detalle</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          {l.description}
                          <div className="text-xs text-muted-foreground">
                            {l.kind === "SERVICE" ? "Servicio" : l.reference}
                          </div>
                        </TableCell>
                        <TableCell>{l.quantity}</TableCell>
                        <TableCell>{cop(l.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {selected.terms && (
                <p className="whitespace-pre-wrap">{selected.terms}</p>
              )}
              {selected.allocations?.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 border-b pb-3"
                >
                  <span>
                    Venta {a.saleNumber} · {cop(a.amount)}{" "}
                    {a.reversed ? "· Revertida" : ""}
                  </span>
                  {role === "ADMIN" && !a.reversed && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        form({
                          kind: "payment-unapply",
                          title: "Revertir aplicación",
                          extra: { allocationId: a.id },
                          fields: [reason],
                        })
                      }
                    >
                      <Undo2 data-icon="inline-start" />
                      Revertir aplicación
                    </Button>
                  )}
                </div>
              ))}
              {resource === "sales" && (
                <Attachments entityType="SALE" entityId={selected.id} />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <FormSheet
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {editor?.mode === "sale"
                ? "Registrar venta"
                : editor?.source
                  ? "Nueva versión de cotización"
                  : "Nueva cotización"}
            </SheetTitle>
            <SheetDescription>
              Repuestos, servicios y condiciones del trabajo.
            </SheetDescription>
          </SheetHeader>
          {editor && (
            <DocumentEditor
              key={`${editor.mode}-${editor.source?.id ?? "new"}`}
              {...editor}
              data={data}
              orders={orders}
              locations={locations}
              onSaved={() => {
                setEditor(null);
                toast.success("Documento guardado.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
      <FormSheet
        open={!!displayedDialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>{displayedDialog?.title}</SheetTitle>
            <SheetDescription>
              {displayedDialog?.description ??
                "El registro quedará en el historial."}
            </SheetDescription>
          </SheetHeader>
          {displayedDialog && (
            <OperationForm
              key={`${displayedDialog.kind}-${JSON.stringify(displayedDialog.extra)}`}
              dialog={displayedDialog}
              submit={async (input) => {
                await command.mutateAsync({
                  kind: displayedDialog.kind as Parameters<
                    typeof command.mutateAsync
                  >[0]["kind"],
                  input,
                });
                setDialog(null);
                setSelected(null);
                toast.success("Registro guardado.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </div>
  );
}
