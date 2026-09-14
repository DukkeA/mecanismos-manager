"use client";
import { SearchX as EmptySearchX } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { RecordStamp } from "@/features/activity/activity-ui";
import { ManagementReport } from "./management-report";
import { Attachments } from "./attachments";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, ArrowUpDown, MoreVertical, Download } from "lucide-react";
import { toast } from "sonner";
import { useControlPage, useControlCommand } from "./hooks";
import { PurchaseEditor } from "./purchase-editor";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Choice,
  DateRangePicker,
  dateLabel,
} from "@/components/workshop-controls";
import { todayInBogota, cop } from "@/features/cash/summary";
import type { HubResource, HubRow } from "@/domain/hub";
import type { OperationsView } from "@/domain/operations-view";
import type { OrderView } from "@/domain/workshop-view";
import type { Role } from "@/domain/permissions";
import { CountImporter } from "./count-importer";
const names: Record<HubResource, string> = {
  purchases: "Compras",
  reservations: "Reservas",
  transfers: "Traslados",
  counts: "Conteos",
  units: "Unidades propias",
  warranties: "Garantías",
  checks: "Pruebas técnicas",
  handovers: "Recepción y entrega",
  assets: "Vehículos y componentes",
  rates: "Costo por hora",
  margins: "Margen por trabajo",
  closures: "Cierres de caja",
  recurring: "Gastos recurrentes",
  coverage: "Revisión mensual",
  audit: "Historial de cambios",
};
const statusNames: Record<string, string> = {
  OPEN: "Abierto",
  CLOSED: "Cerrado",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  RELEASED: "Liberada",
  CONSUMED: "Consumida",
  RECORDED: "Registrado",
  DRAFT: "Por aplicar",
  APPLIED: "Aplicado",
  REBUILDING: "En reconstrucción",
  AVAILABLE: "Disponible",
  SOLD: "Vendido",
  PENDING: "Pendiente",
  ACCEPTED: "Aceptada",
  REJECTED: "No aceptada",
  PASS: "Satisfactoria",
  FAIL: "Requiere corrección",
  RECEPTION: "Recepción",
  DELIVERY: "Entrega",
  VEHICLE: "Vehículo",
  COMPONENT: "Componente",
  EFFECTIVE: "Vigente desde",
  REOPENED: "Reabierto",
  CONFIRMED: "Confirmado",
  ESTIMATED: "Por revisar",
  RECEIVED: "Recibida",
  DIAGNOSING: "Diagnóstico",
  IN_PROGRESS: "En reparación",
  READY: "Lista",
  QUALITY_REVIEW: "En prueba",
  ON_HOLD: "En espera",
  CANCELLED: "Cancelada",
};
const resourceStatuses: Partial<Record<HubResource, string[]>> = {
  purchases: ["OPEN", "CLOSED"],
  reservations: ["ACTIVE", "RELEASED", "CONSUMED"],
  counts: ["DRAFT", "APPLIED"],
  units: ["REBUILDING", "AVAILABLE", "SOLD"],
  warranties: ["PENDING", "ACCEPTED", "REJECTED"],
  checks: ["PASS", "FAIL"],
  handovers: ["RECEPTION", "DELIVERY"],
  assets: ["VEHICLE", "COMPONENT"],
  closures: ["CLOSED", "REOPENED"],
  recurring: ["ACTIVE", "INACTIVE"],
  coverage: ["CONFIRMED", "ESTIMATED"],
};
const createNames: Partial<Record<HubResource, string>> = {
  purchases: "Nuevo pedido",
  units: "Registrar unidad",
  warranties: "Nueva garantía",
  rates: "Añadir tarifa",
  closures: "Cerrar caja",
  recurring: "Nuevo gasto",
  checks: "Registrar prueba",
  handovers: "Registrar constancia",
};
const fieldNames: Record<string, string> = {
  reference: "Referencia",
  note: "Observaciones",
  dueOn: "Vencimiento",
  ordered: "Pedido (COP)",
  received: "Recibido (COP)",
  paid: "Pagado (COP)",
  quantity: "Cantidad",
  condition: "Condición",
  cost: "Costo (COP)",
  appliedAt: "Aplicado",
  serial: "Serie",
  coreCost: "Costo del casco (COP)",
  rebuildCost: "Costo de reconstrucción (COP)",
  symptom: "Síntoma",
  diagnosis: "Diagnóstico",
  cause: "Causa registrada",
  reviewer: "Revisó",
  readings: "Lecturas y resultado",
  inventory: "Elementos recibidos / entregados",
  acceptedBy: "Aceptó",
  plate: "Placa",
  revenue: "Venta neta (COP)",
  material: "Materiales (COP)",
  labor: "Mano de obra (COP)",
  minutes: "Minutos registrados",
  missingMinutes: "Minutos sin tarifa",
  missingMaterials: "Hay materiales sin valorar",
  estimatedMaterials: "Material previsto (COP)",
  purpose: "Tipo de trabajo",
  expected: "Saldo registrado (COP)",
  counted: "Saldo contado (COP)",
  difference: "Diferencia (COP)",
  reopenReason: "Motivo de reapertura",
  category: "Categoría",
  dueDay: "Día de vencimiento",
  details: "Detalle del cambio",
};
const enumNames: Record<string, string> = {
  true: "Sí",
  false: "No",
  NEW: "Nuevo",
  USED: "Usado",
  REBUILT: "Reconstruido",
  PART: "Repuesto",
  WORKMANSHIP: "Ejecución del trabajo",
  EXTERNAL: "Causa externa",
  UNDETERMINED: "Sin determinar",
  CUSTOMER_REPAIR: "Reparación de cliente",
  OWN_REBUILD: "Reconstrucción propia",
  WARRANTY: "Garantía",
  RENT: "Arriendo",
  UTILITIES: "Servicios públicos",
  PAYROLL: "Nómina y prestaciones",
  OTHER: "Otros",
};
export type ControlProps = {
  data: OperationsView;
  orders: OrderView[];
  locations: { id: string; name: string }[];
  role: Role;
  resources: HubResource[];
  orderId?: string;
  payables?: boolean;
};
export function ControlPanel({
  data,
  orders,
  locations,
  role,
  resources,
  orderId,
  payables = false,
}: ControlProps) {
  const params = useSearchParams(),
    [localTab, setLocalTab] = useState<HubResource>(resources[0]);
  const [localPage, setLocalPage] = useState(1);
  const resource = orderId
    ? localTab
    : (resources.find((r) => r === params.get("controlTab")) ?? resources[0]);
  const qp = new URLSearchParams({ resource, ...(orderId ? { orderId } : {}) });
  for (const k of ["q", "page", "orderBy", "direction", "status", "from", "to"])
    if (!orderId && params.get(k)) qp.set(k, params.get(k)!);
  if (orderId) qp.set("page", String(localPage));
  if (payables) qp.set("outstanding", "true");
  const query = useControlPage(qp),
    command = useControlCommand();
  const [selected, setSelected] = useState<HubRow | null>(null),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [special, setSpecial] = useState<"purchase" | "count" | null>(null);
  const update = (values: Record<string, string>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(values)) v ? p.set(k, v) : p.delete(k);
    if (!("page" in values)) p.delete("page");
    window.history.replaceState(null, "", `?${p}`);
  };
  const choose = (
    key: string,
    label: string,
    options: { id: string; label: string }[],
  ): FormField => ({ key, label, type: "select", options });
  const m = (key: string, label: string): FormField => ({
      key,
      label,
      type: "money",
    }),
    text = (key: string, label: string): FormField => ({ key, label }),
    date = (key: string, label = "Fecha"): FormField => ({
      key,
      label,
      type: "date",
    });
  const reason: FormField = {
      key: "reason",
      label: "Motivo",
      type: "textarea",
    },
    note: FormField = { key: "note", label: "Observaciones", type: "textarea" },
    qty: FormField = { key: "quantity", label: "Cantidad", type: "quantity" },
    amount = m("amount", "Importe (COP)"),
    account = choose(
      "accountId",
      "Cuenta",
      data.accounts.map((a) => ({ id: a.id, label: a.name })),
    ),
    location = choose(
      "locationId",
      "Sede",
      locations.map((l) => ({ id: l.id, label: l.name })),
    ),
    item = choose(
      "itemId",
      "Repuesto",
      data.items
        .filter((i) => i.kind === "PART")
        .map((i) => ({
          id: i.id,
          label: `${i.name} · ${i.reference || i.code}`,
        })),
    ),
    condition = choose("condition", "Condición", [
      { id: "NEW", label: "Nuevo" },
      { id: "USED", label: "Usado" },
      { id: "REBUILT", label: "Reconstruido" },
    ]),
    order = choose(
      "orderId",
      "Orden",
      orders.map((o) => ({ id: o.id, label: `OT-${o.number} · ${o.title}` })),
    ),
    customer = choose(
      "customerId",
      "Cliente",
      data.customers
        .filter((c) => !c.deletedAt)
        .map((c) => ({ id: c.id, label: c.name })),
    );
  function form(
    kind: string,
    title: string,
    fields: FormField[],
    extra: Record<string, unknown> = {},
    description?: string,
  ) {
    setDialog({
      kind,
      title,
      fields,
      description,
      extra: {
        occurredOn: todayInBogota(),
        throughOn: todayInBogota(),
        effectiveOn: todayInBogota(),
        issuedOn: todayInBogota(),
        dueOn: todayInBogota(),
        ...extra,
      },
    });
  }
  function create() {
    switch (resource) {
      case "purchases":
        setSpecial("purchase");
        break;
      case "reservations":
        form("reserve", "Reservar repuestos", [
          item,
          location,
          condition,
          order,
          qty,
        ]);
        break;
      case "transfers":
        form("stock-transfer", "Trasladar repuestos", [
          item,
          { ...location, key: "sourceId", label: "Sede de origen" },
          { ...location, key: "destinationId", label: "Sede de destino" },
          condition,
          qty,
          reason,
        ]);
        break;
      case "counts":
        setSpecial("count");
        break;
      case "units":
        form("unit", "Registrar unidad propia", [
          item,
          location,
          text("code", "Código interno"),
          { ...text("serial", "Número de serie"), optional: true },
          order,
          m("coreCost", "Costo del casco (COP)"),
        ]);
        break;
      case "warranties":
        form("warranty", "Abrir garantía", [
          { key: "saleId", label: "Venta original", type: "sale" },
          location,
          { key: "symptom", label: "Síntoma reportado", type: "textarea" },
        ]);
        break;
      case "checks":
        form(
          "check",
          "Registrar prueba técnica",
          [
            ...(!orderId ? [order] : []),
            text("name", "Prueba realizada"),
            choose("result", "Resultado", [
              { id: "PASS", label: "Satisfactoria" },
              { id: "FAIL", label: "Requiere corrección" },
            ]),
            {
              key: "readings",
              label: "Lecturas, tolerancias y observaciones",
              type: "textarea",
            },
          ],
          { orderId },
        );
        break;
      case "handovers":
        form(
          "handover",
          "Registrar recepción o entrega",
          [
            ...(!orderId ? [order] : []),
            choose("kind", "Registro", [
              { id: "RECEPTION", label: "Recepción" },
              { id: "DELIVERY", label: "Entrega" },
            ]),
            {
              key: "condition",
              label: "Estado del vehículo o componente",
              type: "textarea",
            },
            {
              key: "inventory",
              label: "Elementos recibidos o entregados",
              type: "textarea",
            },
            text("acceptedBy", "Nombre de quien acepta"),
            note,
          ],
          { orderId },
        );
        break;
      case "closures":
        form("cash-close", "Cerrar caja", [
          account,
          date("throughOn", "Cerrar hasta"),
          m("counted", "Dinero contado o saldo del extracto (COP)"),
          note,
        ]);
        break;
      case "recurring":
        form("recurring", "Crear gasto recurrente", [
          text("title", "Concepto"),
          choose(
            "category",
            "Categoría",
            Object.entries(enumNames)
              .filter(([k]) =>
                ["RENT", "UTILITIES", "OTHER", "PAYROLL"].includes(k),
              )
              .map(([id, label]) => ({ id, label })),
          ),
          amount,
          text("dueDay", "Día del mes (1–31)"),
        ]);
        break;
      case "coverage":
        form(
          "month-generate",
          "Generar gastos del mes",
          [text("period", "Mes (AAAA-MM)")],
          { period: todayInBogota().slice(0, 7) },
          "Se crean los gastos recurrentes que aún no existen para ese mes.",
        );
        break;
    }
  }
  function actions(row: HubRow) {
    const a: { label: string; run: () => void; danger?: boolean }[] = [];
    if (resource === "purchases") {
      if (Number(row.amount) > 0)
        a.push({
          label: "Pagar compra",
          run: () =>
            form(
              "supplier-pay",
              "Pagar compra",
              [account, amount, date("occurredOn"), reason],
              { purchaseId: row.id, amount: row.amount },
            ),
        });
      if (Number(row.amount) < 0 && role === "ADMIN")
        a.push({
          label: "Recibir devolución del proveedor",
          run: () =>
            form(
              "supplier-pay",
              "Recibir devolución",
              [account, amount, date("occurredOn"), reason],
              {
                purchaseId: row.id,
                refund: true,
                amount: String(-Number(row.amount)),
              },
            ),
        });
      if (row.status === "OPEN")
        a.push({
          label: "Cerrar pedido",
          run: () =>
            form(
              "purchase-close",
              "Cerrar pedido pendiente",
              [reason],
              { purchaseId: row.id },
              "Se cancelan las cantidades pendientes por recibir. Los recibos y pagos se conservan.",
            ),
        });
    }
    if (resource === "reservations" && row.status === "ACTIVE")
      for (const [action, label] of [
        ["CONSUME", "Consumir reserva"],
        ["RELEASE", "Liberar reserva"],
      ])
        a.push({
          label,
          run: () =>
            form("reservation-finish", label, [reason], {
              reservationId: row.id,
              action,
            }),
        });
    if (resource === "counts" && row.status === "DRAFT")
      a.push({
        label: "Aplicar conteo",
        run: () =>
          form(
            "count-apply",
            "Aplicar cantidades contadas",
            [],
            { countId: row.id },
            "Confirma la vista previa. Las referencias ausentes en el archivo no cambian. Si hubo movimientos posteriores, será necesario volver a contar.",
          ),
      });
    if (resource === "units") {
      if (row.status === "REBUILDING" && role === "ADMIN")
        a.push({
          label: "Dar de alta para venta",
          run: () =>
            form(
              "unit-finish",
              "Dar de alta unidad",
              [],
              { unitId: row.id },
              "Se fija el costo del casco, los materiales y la mano de obra de la reconstrucción cerrada.",
            ),
        });
      if (row.status === "AVAILABLE")
        a.push({
          label: "Vender unidad",
          run: () =>
            form(
              "unit-sell",
              "Vender unidad propia",
              [
                customer,
                m("price", "Precio de venta (COP)"),
                date("issuedOn", "Fecha de venta"),
                date("dueOn", "Vencimiento"),
                {
                  key: "terms",
                  label: "Condiciones y garantía acordada",
                  type: "textarea",
                },
              ],
              { unitId: row.id },
            ),
        });
    }
    if (resource === "warranties" && row.status === "PENDING")
      a.push({
        label: "Registrar diagnóstico y decisión",
        run: () =>
          form(
            "warranty-review",
            "Revisar garantía",
            [
              { key: "diagnosis", label: "Diagnóstico", type: "textarea" },
              choose("decision", "Decisión", [
                { id: "ACCEPTED", label: "Aceptada" },
                { id: "REJECTED", label: "No aceptada" },
              ]),
              choose(
                "cause",
                "Causa",
                Object.entries(enumNames)
                  .filter(([k]) =>
                    [
                      "PART",
                      "WORKMANSHIP",
                      "EXTERNAL",
                      "UNDETERMINED",
                    ].includes(k),
                  )
                  .map(([id, label]) => ({ id, label })),
              ),
            ],
            { warrantyId: row.id },
          ),
      });
    if (resource === "assets")
      a.push({
        label: "Cambiar propietario",
        run: () =>
          form(
            "asset-owner",
            "Cambiar propietario",
            [customer, reason],
            { assetId: row.id },
            "Las órdenes anteriores conservan su cliente y su historia.",
          ),
      });
    if (resource === "closures" && role === "ADMIN" && row.status === "CLOSED")
      a.push({
        label: "Reabrir cierre",
        run: () =>
          form("cash-reopen", "Reabrir cierre", [reason], {
            closureId: row.id,
          }),
      });
    if (resource === "recurring")
      a.push(
        {
          label: "Editar gasto recurrente",
          run: () =>
            form(
              "recurring",
              "Editar gasto recurrente",
              [
                text("title", "Concepto"),
                amount,
                text("dueDay", "Día del mes (1–31)"),
              ],
              {
                id: row.id,
                title: row.title,
                category: row.data.category,
                amount: row.amount,
                dueDay: row.data.dueDay,
                active: row.status === "ACTIVE",
              },
            ),
        },
        {
          label: row.status === "ACTIVE" ? "Desactivar" : "Activar",
          run: () =>
            form(
              "recurring",
              row.status === "ACTIVE" ? "Desactivar gasto" : "Activar gasto",
              [],
              {
                id: row.id,
                title: row.title,
                category: row.data.category,
                amount: row.amount,
                dueDay: row.data.dueDay,
                active: row.status !== "ACTIVE",
              },
            ),
        },
      );
    if (resource === "coverage")
      a.push({
        label: "Confirmar gastos completos",
        run: () =>
          form(
            "month-confirm",
            "Confirmar revisión del mes",
            [note],
            { period: row.id },
            "Confirma que están registrados y revisados los arriendos, servicios, nómina, prestaciones y demás gastos del mes.",
          ),
      });
    return a;
  }
  const canCreate = !["assets", "margins", "audit", "rates"].includes(resource),
    page = query.data?.page ?? 1,
    pages = Math.max(
      1,
      Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 10)),
    );
  const showAmount = ![
    "assets",
    "checks",
    "handovers",
    "audit",
    "coverage",
    "warranties",
  ].includes(resource);
  const units = ["reservations", "transfers", "counts"].includes(resource);
  return (
    <div className="flex flex-col gap-4">
      {resources.length > 1 && (
        <Tabs
          value={resource}
          onValueChange={(v) => {
            setSelected(null);
            if (orderId) {
              setLocalTab(v as HubResource);
              setLocalPage(1);
            } else
              update({
                controlTab: v,
                q: "",
                status: "",
                page: "",
                orderBy: "",
                direction: "",
              });
          }}
        >
          <TabsList className="h-auto flex-wrap" aria-label="Secciones">
            {resources.map((r) => (
              <TabsTrigger key={r} value={r}>
                {names[r]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {resource === "margins" && (
        <p className="text-sm text-muted-foreground">
          Venta neta menos materiales y mano de obra registrada. El margen de
          una orden abierta es provisional. Las órdenes sin venta muestran sus
          costos en el detalle. No incluye arriendos ni otros gastos generales.
          Configura los salarios en Equipo. Las horas sin costo laboral impiden
          calcular el margen completo.
        </p>
      )}
      {!orderId && (
        <div
          className="commercial-filters"
          role="search"
          aria-label="Filtros de registros"
        >
          <label>
            Buscar
            <Input
              className="min-w-44 flex-1"
              aria-label={`Buscar en ${names[resource]}`}
              placeholder="Buscar por nombre o referencia"
              value={params.get("q") ?? ""}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          {resourceStatuses[resource] && (
            <label>
              {resource === "assets" ? "Tipo" : "Estado"}
              <Choice
                label={resource === "assets" ? "Tipo" : "Estado"}
                value={params.get("status") ?? ""}
                onChange={(status) => update({ status })}
                options={[
                  {
                    id: "",
                    label:
                      resource === "assets"
                        ? "Vehículos y componentes"
                        : "Todos los estados",
                  },
                  ...resourceStatuses[resource]!.map((value) => ({
                    id: value,
                    label: statusNames[value],
                  })),
                ]}
              />
            </label>
          )}
          <label className="commercial-date-filter">
            Fechas
            <DateRangePicker
              from={params.get("from") ?? ""}
              to={params.get("to") ?? ""}
              onChange={(from, to) => update({ from, to })}
            />
          </label>
          {(params.get("q") ||
            params.get("from") ||
            params.get("to") ||
            params.get("status")) && (
            <Button
              variant="ghost"
              onClick={() => update({ q: "", from: "", to: "", status: "" })}
            >
              Limpiar
            </Button>
          )}
          {canCreate && (
            <Button onClick={create}>
              <Plus />
              {resource === "coverage"
                ? "Generar mes"
                : resource === "counts"
                  ? "Importar conteo"
                  : resource === "transfers"
                    ? "Nuevo traslado"
                    : resource === "reservations"
                      ? "Nueva reserva"
                      : (createNames[resource] ?? "Añadir registro")}
            </Button>
          )}
          {role === "ADMIN" && (
            <Button
              variant="outline"
              onClick={() =>
                window.open(`/api/export?${qp}`, "_blank", "noopener")
              }
            >
              <Download />
              Exportar
            </Button>
          )}
        </div>
      )}
      {orderId && canCreate && (
        <Button className="self-start" variant="outline" onClick={create}>
          <Plus />
          {resource === "checks"
            ? "Registrar prueba"
            : "Registrar recepción / entrega"}
        </Button>
      )}
      {resource === "margins" && (
        <ManagementReport
          from={params.get("from") ?? undefined}
          to={params.get("to") ?? undefined}
        />
      )}
      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>{query.error.message}</AlertTitle>
          <Button variant="outline" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </Alert>
      )}
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? null : (
        <div className="data-panel">
          {query.data?.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    ["title", "Registro"],
                    [
                      "date",
                      resource === "assets" ? "Último ingreso" : "Fecha",
                    ],
                    ["", resource === "assets" ? "Tipo" : "Estado"],
                    [
                      "amount",
                      units
                        ? "Cantidad"
                        : resource === "margins"
                          ? "Margen (COP)"
                          : resource === "closures"
                            ? "Diferencia (COP)"
                            : resource === "purchases"
                              ? "Saldo por pagar (COP)"
                              : "Importe (COP)",
                    ],
                  ]
                    .filter(([key]) => key !== "amount" || showAmount)
                    .map(([key, label]) => (
                      <TableHead key={label}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!key || !!orderId}
                          onClick={() =>
                            update({
                              orderBy: key,
                              direction:
                                params.get("orderBy") === key &&
                                params.get("direction") === "asc"
                                  ? "desc"
                                  : "asc",
                            })
                          }
                        >
                          {label}
                          {key && <ArrowUpDown />}
                        </Button>
                      </TableHead>
                    ))}
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Button variant="link" onClick={() => setSelected(row)}>
                        {row.title}
                      </Button>
                      {["closures", "recurring"].includes(resource) && (
                        <div>
                          <RecordStamp id={row.id} />
                        </div>
                      )}
                      <p className="max-w-80 truncate text-xs text-muted-foreground">
                        {row.subtitle}
                      </p>
                    </TableCell>
                    <TableCell>{dateLabel(row.date)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          [
                            "PASS",
                            "CONFIRMED",
                            "AVAILABLE",
                            "ACCEPTED",
                          ].includes(row.status ?? "")
                            ? "default"
                            : "secondary"
                        }
                      >
                        {statusNames[row.status ?? ""] ?? row.status}
                      </Badge>
                    </TableCell>
                    {showAmount && (
                      <TableCell
                        className={
                          Number(row.amount) < 0
                            ? "text-destructive tabular-nums"
                            : "tabular-nums"
                        }
                      >
                        {row.amount === undefined
                          ? "—"
                          : units
                            ? row.amount
                            : cop(row.amount)}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Acciones de ${row.title}`}
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
                              <DropdownMenuItem key={a.label} onSelect={a.run}>
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
            <DataEmpty
              icon={EmptySearchX}
              title="Sin registros para esta consulta"
              description="Ajusta los filtros para consultar otro período o estado."
            />
          )}
          {
            <div className="flex justify-between items-center gap-3 border-t p-3">
              <span className="text-sm text-muted-foreground">
                {query.data?.total ?? 0} registros · Página {page} de {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() =>
                    orderId
                      ? setLocalPage(page - 1)
                      : update({ page: String(page - 1) })
                  }
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= pages}
                  onClick={() =>
                    orderId
                      ? setLocalPage(page + 1)
                      : update({ page: String(page + 1) })
                  }
                >
                  Siguiente
                </Button>
              </div>
            </div>
          }
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
              {selected?.subtitle || names[resource]}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="sheet-body flex flex-col gap-5">
              <div className="flex flex-wrap gap-2">
                {actions(selected).map((a) => (
                  <Button key={a.label} variant="outline" onClick={a.run}>
                    {a.label}
                  </Button>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-4">
                {Object.entries(selected.data)
                  .filter(([k]) => fieldNames[k])
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className={
                        [
                          "note",
                          "condition",
                          "inventory",
                          "diagnosis",
                          "symptom",
                          "readings",
                          "details",
                        ].includes(k)
                          ? "col-span-2"
                          : ""
                      }
                    >
                      <dt className="text-sm text-muted-foreground">
                        {fieldNames[k]}
                      </dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {!v
                          ? "Sin registrar"
                          : fieldNames[k].includes("(COP)")
                            ? cop(v)
                            : ["dueOn", "appliedAt"].includes(k)
                              ? dateLabel(v)
                              : (enumNames[v] ?? v)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {selected.data.rows && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Repuesto</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Costo unitario</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      JSON.parse(selected.data.rows) as {
                        code: string;
                        name: string;
                        quantity: string;
                        unitCost?: string;
                      }[]
                    ).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.quantity}</TableCell>
                        <TableCell>
                          {r.unitCost === undefined
                            ? "Sin costo"
                            : cop(r.unitCost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {selected.data.history && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orden</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Ingreso</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      JSON.parse(selected.data.history) as {
                        orderId: string;
                        number: number;
                        customer: string;
                        receivedAt: string;
                      }[]
                    ).map((r) => (
                      <TableRow key={r.orderId}>
                        <TableCell>OT-{r.number}</TableCell>
                        <TableCell>{r.customer}</TableCell>
                        <TableCell>{dateLabel(r.receivedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {selected.entries?.map((line) => (
                <section key={line.id} className="border-t pt-4">
                  <h3 className="font-semibold">{line.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    Pedido: {line.data.quantity} · Recibido neto:{" "}
                    {line.data.received} · Costo unitario:{" "}
                    {cop(line.data.unitCost)}
                  </p>
                  {selected.status === "OPEN" && (
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() =>
                        form(
                          "purchase-receive",
                          "Recibir repuesto",
                          [qty, date("occurredOn"), reason],
                          { lineId: line.id },
                        )
                      }
                    >
                      Registrar recepción
                    </Button>
                  )}
                  {line.receipts
                    ?.filter((r) => !r.originalId)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="mt-3 flex items-center justify-between gap-2"
                      >
                        <span>
                          Recepción: {r.quantity} · {cop(r.amount)}
                        </span>
                        {role === "ADMIN" && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              form(
                                "purchase-return",
                                "Devolver al proveedor",
                                [qty, date("occurredOn"), reason],
                                { receiptId: r.id },
                              )
                            }
                          >
                            Devolver
                          </Button>
                        )}
                      </div>
                    ))}
                </section>
              ))}
              {["purchases", "warranties"].includes(resource) && (
                <Attachments
                  entityType={
                    resource === "purchases" ? "PURCHASE" : "WARRANTY"
                  }
                  entityId={selected.id}
                />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <FormSheet
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>{dialog?.title}</SheetTitle>
            <SheetDescription>
              {dialog?.description ??
                "El registro se conservará en el historial."}
            </SheetDescription>
          </SheetHeader>
          {dialog && (
            <OperationForm
              key={`${dialog.kind}-${JSON.stringify(dialog.extra)}`}
              dialog={dialog}
              submit={async (input) => {
                await command.mutateAsync({
                  kind: dialog.kind as Parameters<
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
      <FormSheet
        open={!!special}
        onOpenChange={(open) => {
          if (!open) setSpecial(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {special === "purchase"
                ? "Nuevo pedido a proveedor"
                : "Importar conteo"}
            </SheetTitle>
            <SheetDescription>
              {special === "purchase"
                ? "La recepción posterior dará entrada al inventario."
                : "Revisa las cantidades antes de aplicarlas al inventario."}
            </SheetDescription>
          </SheetHeader>
          {special === "purchase" ? (
            <PurchaseEditor
              data={data}
              locations={locations}
              onSaved={() => {
                setSpecial(null);
                toast.success("Pedido guardado.");
              }}
            />
          ) : special === "count" ? (
            <CountImporter
              locations={locations}
              onSaved={() => {
                setSpecial(null);
                toast.success(
                  "Vista previa guardada. Abre el conteo para revisarlo.",
                );
              }}
            />
          ) : null}
        </SheetContent>
      </FormSheet>
    </div>
  );
}
