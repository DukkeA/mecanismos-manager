"use client";
import { FormSheet } from "@/components/form-sheet";
import { DataTable } from "./data-table";
import { OperationForm, type Dialog, type Option } from "./operation-form";

import {
  FilterBar,
  ClearFilters,
  Choice,
  dateLabel,
  DateRangePicker,
  inDates,
  matches,
  useQueryState,
} from "./workshop-controls";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useState } from "react";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { TableCell, TableRow } from "@/components/ui/table";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Badge } from "@/components/ui/badge";

import type { OperationsView } from "@/domain/operations-view";

import type { OrderView } from "@/domain/workshop-view";

import type { Role } from "@/domain/permissions";

type Props = {
  section: string;
  data: OperationsView;
  orders: OrderView[];
  locations: { id: string; name: string }[];
  role: Role;
  demo: boolean;
  run: (kind: string, input: Record<string, unknown>) => Promise<void>;
  openOrder: (id: string) => void;
};

const conditions: Option[] = [
  { id: "NEW", label: "Nuevo" },
  { id: "USED", label: "Usado" },
  { id: "REBUILT", label: "Reconstruido" },
];

const money = (value: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  }).format(Number(value));

const taskLabels: Record<string, string> = {
  TODO: "Pendiente",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueada",
  DONE: "Terminada",
};

export function OperationsPanel({
  section,
  data: source,
  orders,
  locations,
  role,
  demo,
  run,
}: Props) {
  const [search, setSearch] = useQueryState("q");

  const [status, setStatus] = useQueryState("status", "ALL");

  const [brand, setBrand] = useQueryState("brand", "ALL");

  const [location, setLocation] = useQueryState("location", "ALL");

  const [responsible, setResponsible] = useQueryState("responsible", "ALL");

  const [from, setFrom] = useQueryState("from");
  const [to, setTo] = useQueryState("to");

  const [min, setMin] = useQueryState("min");
  const [max, setMax] = useQueryState("max");

  const [tab, setTab] = useQueryState("tab", "own");

  const itemMatches = (id: string) =>
    brand === "ALL" || source.items.find((i) => i.id === id)?.brand === brand;

  const data: OperationsView = {
    ...source,

    members: source.members.filter(
      (m) =>
        section !== "Equipo" ||
        status === "ALL" ||
        m.role === status ||
        (status === "ACTIVE"
          ? m.active
          : status === "INACTIVE"
            ? !m.active
            : false),
    ),

    tasks: source.tasks.filter(
      (t) =>
        (status === "ALL" || t.status === status) &&
        (responsible === "ALL" || t.members.includes(responsible)) &&
        inDates(t.createdAt, from, to),
    ),

    items: source.items.filter((i) => brand === "ALL" || i.brand === brand),

    balances: source.balances.filter(
      (b) =>
        itemMatches(b.itemId) &&
        (location === "ALL" || b.locationId === location) &&
        (status !== "ZERO" || Number(b.quantity) - Number(b.reserved) <= 0) &&
        (status !== "AVAILABLE" || Number(b.quantity) - Number(b.reserved) > 0),
    ),

    offers: source.offers.filter(
      (o) =>
        itemMatches(o.itemId) &&
        (!min || Number(o.unitCost) >= Number(min)) &&
        (!max || Number(o.unitCost) <= Number(max)) &&
        inDates(o.observedAt, from, to),
    ),

    movements: source.movements.filter(
      (m) =>
        itemMatches(m.itemId) &&
        (location === "ALL" || m.locationId === location) &&
        inDates(m.date, from, to),
    ),

    cashEntries: source.cashEntries.filter(
      (e) =>
        (status === "ALL" || e.direction === status) &&
        (!min || Number(e.amount) >= Number(min)) &&
        (!max || Number(e.amount) <= Number(max)) &&
        inDates(e.occurredOn, from, to),
    ),
  };

  const [dialog, setDialog] = useState<Dialog | null>(null);

  const [notice, setNotice] = useState("");

  const itemOptions = source.items
    .filter((i) => i.kind === "PART")
    .map((i) => ({ id: i.id, label: `${i.code} · ${i.name}` }));

  const locationOptions = locations.map((l) => ({ id: l.id, label: l.name }));

  const itemName = (id: string) =>
    source.items.find((i) => i.id === id)?.name ?? "Repuesto";

  const locationName = (id: string) =>
    locations.find((l) => l.id === id)?.name ?? "Sede";

  const conditionName = (id: string) =>
    conditions.find((c) => c.id === id)?.label ?? id;

  const filter = (text: string) => matches(text, search);

  const customerForm: Dialog = {
    kind: "customer",
    title: "Nuevo cliente",
    fields: [
      { key: "name", label: "Nombre o razón social" },
      { key: "document", label: "Documento / NIT", optional: true },
      { key: "phone", label: "Teléfono", optional: true },
      { key: "email", label: "Correo", type: "email", optional: true },
    ],
  };

  const supplierForm: Dialog = {
    kind: "supplier",
    title: "Nuevo proveedor",
    fields: [
      { key: "name", label: "Nombre o razón social" },
      { key: "phone", label: "Teléfono", optional: true },
    ],
  };

  const itemForm: Dialog = {
    kind: "item",
    title: "Nuevo repuesto o servicio",
    fields: [
      { key: "code", label: "Referencia interna" },
      { key: "name", label: "Nombre" },
      { key: "brand", label: "Marca", optional: true },
      {
        key: "kind",
        label: "Tipo",
        type: "select",
        options: [
          { id: "PART", label: "Repuesto por cantidad" },
          { id: "SERVICE", label: "Servicio" },
        ],
      },
      {
        key: "unit",
        label: "Unidad de medida",
        hint: "Ej. unidad, litro, kit",
      },
    ],
  };

  const stockForm: Dialog = {
    kind: "stock",
    title: "Registrar movimiento de inventario",
    fields: [
      {
        key: "itemId",
        label: "Repuesto",
        type: "select",
        options: itemOptions,
      },
      {
        key: "locationId",
        label: "Sede",
        type: "select",
        options: locationOptions,
      },
      {
        key: "condition",
        label: "Condición",
        type: "select",
        options: conditions,
      },
      {
        key: "kind",
        label: "Movimiento",
        type: "select",
        options: [
          { id: "RECEIPT", label: "Entrada de repuestos" },
          { id: "CONSUMPTION", label: "Consumo en orden" },
          ...(role === "ADMIN"
            ? [
                { id: "ADJUSTMENT_IN", label: "Ajuste de entrada" },
                { id: "ADJUSTMENT_OUT", label: "Ajuste de salida" },
              ]
            : []),
        ],
      },
      {
        key: "quantity",
        type: "quantity",
        label: "Cantidad",
        hint: "Usa punto para decimales. Ej. 1.5",
      },
      {
        key: "unitCost",
        type: "money",
        allowZero: true,
        label: "Costo unitario COP",
        hint: "En entradas, indica el costo de compra. En consumos, escribe 0; usaremos el costo del inventario.",
      },
      {
        key: "orderId",
        label: "Orden asociada",
        type: "select",
        optional: true,
        options: orders
          .filter((o) => !["CLOSED", "CANCELLED"].includes(o.status))
          .map((o) => ({ id: o.id, label: `OT-${o.number} · ${o.title}` })),
        hint: "Obligatoria para consumo.",
      },
      { key: "reason", label: "Motivo y soporte", type: "textarea" },
    ],
  };

  const memberForm: Dialog = {
    kind: "member",
    title: "Autorizar miembro del equipo",
    extra: { active: true },
    fields: [
      { key: "name", label: "Nombre completo" },
      {
        key: "email",
        label: "Correo de Google",
        type: "email",
        hint: "Usa el correo con el que esta persona entrará a la aplicación.",
      },
      {
        key: "role",
        label: "Rol",
        type: "select",
        options: [
          { id: "MECHANIC", label: "Mecánico" },
          { id: "OFFICE", label: "Oficina" },
          { id: "ADMIN", label: "Administrador" },
        ],
      },
    ],
  };

  function primary() {
    return section === "Clientes"
      ? customerForm
      : section === "Proveedores"
        ? supplierForm
        : section === "Equipo"
          ? memberForm
          : itemForm;
  }

  const safeRun = async (kind: string, input: Record<string, unknown>) => {
    await run(kind, input);
    setNotice(
      demo
        ? "Cambio aplicado a la demostración; se pierde al recargar."
        : "Cambio guardado.",
    );
  };

  return (
    <section className="operations-page" aria-labelledby="operations-title">
      <div className="operations-heading">
        <div>
          <h2 id="operations-title" className="sr-only">
            {section}
          </h2>
          <p>
            {section === "Caja"
              ? "Saldos, cobros y pagos del taller."
              : section === "Inventario"
                ? "Repuestos disponibles en oficina y bodega."
                : section === "Proveedores"
                  ? "Precios y disponibilidad informados por cada proveedor."
                  : section === "Equipo"
                    ? "Personas que pueden entrar y permisos de cada una."
                    : section === "Tareas"
                      ? "Tareas de reparación y pendientes del taller."
                      : "Clientes y datos de contacto."}
          </p>
        </div>
        {role !== "MECHANIC" &&
          (section !== "Inventario" || tab === "catalog") && (
            <Button onClick={() => setDialog(primary())}>
              <Plus data-icon="inline-start" />
              {section === "Caja"
                ? "Registrar dinero"
                : section === "Tareas"
                  ? "Asignar tarea"
                  : section === "Equipo"
                    ? "Autorizar miembro"
                    : section === "Clientes"
                      ? "Nuevo cliente"
                      : section === "Proveedores"
                        ? "Nuevo proveedor"
                        : "Nuevo artículo"}
            </Button>
          )}
      </div>

      {notice && (
        <Alert>
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      )}

      <FilterBar>
        <label className="search-filter">
          Buscar
          <Input
            placeholder={
              section === "Clientes"
                ? "Nombre, documento, teléfono o correo"
                : section === "Equipo"
                  ? "Nombre o correo"
                  : `Buscar en ${section.toLowerCase()}`
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {["Tareas", "Equipo", "Caja"].includes(section) && (
          <label>
            {section === "Equipo" ? "Rol / acceso" : "Estado"}
            <Choice
              value={status}
              onChange={setStatus}
              options={[
                { id: "ALL", label: "Todos" },
                ...(section === "Tareas"
                  ? Object.entries(taskLabels).map(([id, label]) => ({
                      id,
                      label,
                    }))
                  : section === "Equipo"
                    ? [
                        { id: "ADMIN", label: "Administración" },
                        { id: "OFFICE", label: "Oficina" },
                        { id: "MECHANIC", label: "Mecánico" },
                        { id: "ACTIVE", label: "Activos" },
                        { id: "INACTIVE", label: "Inactivos" },
                      ]
                    : [
                        { id: "IN", label: "Entradas" },
                        { id: "OUT", label: "Salidas" },
                      ]),
              ]}
            />
          </label>
        )}

        {["Inventario", "Proveedores"].includes(section) && (
          <label>
            Marca
            <Choice
              value={brand}
              onChange={setBrand}
              options={[
                { id: "ALL", label: "Todas" },
                ...[
                  ...new Set(source.items.map((i) => i.brand).filter(Boolean)),
                ]
                  .sort()
                  .map((id) => ({ id, label: id })),
              ]}
            />
          </label>
        )}

        {section === "Inventario" &&
          tab !== "suppliers" &&
          tab !== "catalog" && (
            <label>
              Sede
              <Choice
                value={location}
                onChange={setLocation}
                options={[
                  { id: "ALL", label: "Todas" },
                  ...locationOptions,
                ]}
              />
            </label>
          )}

        {section === "Inventario" && tab === "own" && (
          <label>
            Disponibilidad
            <Choice
              value={status}
              onChange={setStatus}
              options={[
                { id: "ALL", label: "Todas" },
                { id: "AVAILABLE", label: "Con existencias" },
                { id: "ZERO", label: "Sin disponibilidad" },
              ]}
            />
          </label>
        )}

        {(["Caja", "Tareas", "Proveedores"].includes(section) ||
          (section === "Inventario" &&
            ["movements", "suppliers"].includes(tab))) && (
          <label className="range-filter">
            {section === "Tareas"
              ? "Fecha de creación"
              : section === "Caja"
                ? "Fecha del movimiento"
                : "Fecha de consulta"}
            <DateRangePicker
              from={from}
              to={to}
              onChange={(from, to) => {
                setFrom(from);
                setTo(to);
              }}
            />
          </label>
        )}

        {(["Caja", "Proveedores"].includes(section) ||
          (section === "Inventario" && tab === "suppliers")) && (
          <>
            <label>
              Valor mínimo COP
              <Input
                type="number"
                min="0"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </label>
            <label>
              Valor máximo COP
              <Input
                type="number"
                min="0"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </label>
          </>
        )}

        <ClearFilters
          active={
            !!(
              search ||
              from ||
              to ||
              min ||
              max ||
              status !== "ALL" ||
              brand !== "ALL" ||
              location !== "ALL" ||
              responsible !== "ALL"
            )
          }
          onClear={() => {
            setSearch("");
            setStatus("ALL");
            setBrand("ALL");
            setLocation("ALL");
            setResponsible("ALL");
            setFrom("");
            setTo("");
            setMin("");
            setMax("");
          }}
        />
      </FilterBar>

      {from && to && from > to && (
        <p role="alert">La fecha inicial debe ser anterior a la final.</p>
      )}

      {section === "Clientes" && (
        <DataTable
          headers={["Cliente", "Documento", "Contacto", "Órdenes", "Acciones"]}
          empty="No hay clientes con esos datos."
        >
          {data.customers
            .filter((c) =>
              filter(`${c.name} ${c.document} ${c.phone} ${c.email}`),
            )
            .map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <strong>{c.name}</strong>
                </TableCell>
                <TableCell>{c.document || "Sin documento"}</TableCell>
                <TableCell>
                  {c.phone || "Sin teléfono"}
                  <small className="cell-detail">{c.email}</small>
                </TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    onClick={() => {
                      const query = new URLSearchParams({
                        view: "Órdenes",
                        q: c.name,
                      });
                      window.history.pushState(null, "", `?${query}`);
                    }}
                  >
                    {c.orders} órdenes
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDialog({
                        ...customerForm,
                        title: "Editar cliente",
                        extra: c,
                      })
                    }
                  >
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </DataTable>
      )}

      {section === "Equipo" && (
        <DataTable
          headers={["Nombre", "Correo", "Rol", "Acceso", "Acciones"]}
          empty="No hay miembros autorizados."
        >
          {data.members
            .filter((m) => filter(`${m.name} ${m.email ?? ""}`))
            .map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.name}</TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>
                  {m.role === "ADMIN"
                    ? "Administrador"
                    : m.role === "OFFICE"
                      ? "Oficina"
                      : "Mecánico"}
                </TableCell>
                <TableCell>
                  <Badge variant={m.active ? "secondary" : "outline"}>
                    {m.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDialog({
                        ...memberForm,
                        title: "Editar acceso",
                        extra: m,
                      })
                    }
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDialog({
                        kind: "member",
                        title: `${m.active ? "Desactivar" : "Activar"} acceso de ${m.name} (${m.email || "sin correo"})`,
                        extra: { ...m, active: !m.active },
                        fields: [],
                      })
                    }
                  >
                    {m.active ? "Desactivar" : "Activar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </DataTable>
      )}

      {section === "Proveedores" && (
        <>
          <DataTable
            headers={["Proveedor", "Teléfono"]}
            empty="Aún no hay proveedores."
          >
            {data.suppliers
              .filter((s) => filter(`${s.name} ${s.phone}`))
              .map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <strong>{s.name}</strong>
                  </TableCell>
                  <TableCell>{s.phone || "Sin teléfono"}</TableCell>
                </TableRow>
              ))}
          </DataTable>
          <div className="operations-heading">
            <div>
              <h3>Registro de precios</h3>
              <p>
                Compara referencia, condición y unidad antes de cotizar. Estos
                valores no incluyen un cálculo de impuestos o flete.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!itemOptions.length || !data.suppliers.length}
              onClick={() =>
                setDialog({
                  kind: "offer",
                  title: "Registrar precio de proveedor",
                  fields: [
                    {
                      key: "itemId",
                      label: "Repuesto",
                      type: "select",
                      options: itemOptions,
                    },
                    {
                      key: "supplierId",
                      label: "Proveedor",
                      type: "select",
                      options: source.suppliers.map((s) => ({
                        id: s.id,
                        label: s.name,
                      })),
                    },
                    {
                      key: "condition",
                      label: "Condición",
                      type: "select",
                      options: conditions,
                    },
                    {
                      key: "unitCost",
                      type: "money",
                      allowZero: true,
                      label: "Precio unitario reportado COP",
                    },
                    {
                      key: "reportedStock",
                      label: "Disponibilidad reportada",
                      optional: true,
                    },
                    {
                      key: "observedAt",
                      label: "Fecha de consulta",
                      type: "date",
                    },
                    {
                      key: "evidence",
                      label: "Fuente / soporte",
                      type: "textarea",
                    },
                  ],
                })
              }
            >
              Registrar precio
            </Button>
          </div>
          <DataTable
            headers={[
              "Repuesto",
              "Proveedor",
              "Condición",
              "Precio COP",
              "Consulta",
              "Disponibilidad / soporte",
            ]}
            empty="Registra un artículo y un proveedor para guardar su primer precio."
          >
            {data.offers
              .filter((o) =>
                filter(
                  `${itemName(o.itemId)} ${source.items.find((i) => i.id === o.itemId)?.code} ${source.suppliers.find((s) => s.id === o.supplierId)?.name} ${o.evidence}`,
                ),
              )
              .map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{itemName(o.itemId)}</TableCell>
                  <TableCell>
                    {data.suppliers.find((s) => s.id === o.supplierId)?.name}
                  </TableCell>
                  <TableCell>{conditionName(o.condition)}</TableCell>
                  <TableCell>{money(o.unitCost)}</TableCell>
                  <TableCell>{dateLabel(o.observedAt)}</TableCell>
                  <TableCell>
                    {o.reportedStock || "No confirmada"}
                    <small className="cell-detail">{o.evidence}</small>
                  </TableCell>
                </TableRow>
              ))}
          </DataTable>
        </>
      )}

      {section === "Inventario" && (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            setStatus("ALL");
            setFrom("");
            setTo("");
          }}
        >
          <TabsList className="inventory-tabs" aria-label="Inventario">
            <TabsTrigger value="own">Inventario propio</TabsTrigger>
            <TabsTrigger value="suppliers">Inventario proveedores</TabsTrigger>
            <TabsTrigger value="catalog">Catálogo y servicios</TabsTrigger>
            <TabsTrigger value="movements">Movimientos</TabsTrigger>
          </TabsList>
          <TabsContent value="own">
            <div className="operations-heading">
              <div>
                <h3>Existencias propias</h3>
                <p>
                  La custodia de piezas del cliente no se registra como entrada
                  propia.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!itemOptions.length || !locations.length}
                onClick={() => setDialog(stockForm)}
              >
                Registrar movimiento
              </Button>
            </div>
            <DataTable
              headers={[
                "Repuesto",
                "Sede",
                "Condición",
                "Disponible",
                "Costo material COP",
              ]}
              empty="No hay existencias registradas."
            >
              {data.balances
                .filter((b) =>
                  filter(
                    `${itemName(b.itemId)} ${source.items.find((i) => i.id === b.itemId)?.code} ${locationName(b.locationId)}`,
                  ),
                )
                .map((b) => (
                  <TableRow key={`${b.itemId}-${b.locationId}-${b.condition}`}>
                    <TableCell>{itemName(b.itemId)}</TableCell>
                    <TableCell>{locationName(b.locationId)}</TableCell>
                    <TableCell>{conditionName(b.condition)}</TableCell>
                    <TableCell>
                      {Number(b.quantity) - Number(b.reserved)}
                    </TableCell>
                    <TableCell>{money(b.materialCost)}</TableCell>
                  </TableRow>
                ))}
            </DataTable>
          </TabsContent>
          <TabsContent value="suppliers">
            <div className="operations-heading">
              <div>
                <h3>Registro de precios</h3>
                <p>
                  Compara referencia, condición y unidad antes de cotizar. Estos
                  valores no incluyen un cálculo de impuestos o flete.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!itemOptions.length || !data.suppliers.length}
                onClick={() =>
                  setDialog({
                    kind: "offer",
                    title: "Registrar precio de proveedor",
                    fields: [
                      {
                        key: "itemId",
                        label: "Repuesto",
                        type: "select",
                        options: itemOptions,
                      },
                      {
                        key: "supplierId",
                        label: "Proveedor",
                        type: "select",
                        options: source.suppliers.map((s) => ({
                          id: s.id,
                          label: s.name,
                        })),
                      },
                      {
                        key: "condition",
                        label: "Condición",
                        type: "select",
                        options: conditions,
                      },
                      {
                        key: "unitCost",
                        type: "money",
                        allowZero: true,
                        label: "Precio unitario reportado COP",
                      },
                      {
                        key: "reportedStock",
                        label: "Disponibilidad reportada",
                        optional: true,
                      },
                      {
                        key: "observedAt",
                        label: "Fecha de consulta",
                        type: "date",
                      },
                      {
                        key: "evidence",
                        label: "Fuente / soporte",
                        type: "textarea",
                      },
                    ],
                  })
                }
              >
                Registrar precio
              </Button>
            </div>
            <DataTable
              headers={[
                "Repuesto",
                "Proveedor",
                "Condición",
                "Precio COP",
                "Consulta",
                "Disponibilidad / soporte",
              ]}
              empty="Registra un artículo y un proveedor para guardar su primer precio."
            >
              {data.offers
                .filter((o) =>
                  filter(
                    `${itemName(o.itemId)} ${source.items.find((i) => i.id === o.itemId)?.code} ${source.suppliers.find((s) => s.id === o.supplierId)?.name} ${o.evidence}`,
                  ),
                )
                .map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{itemName(o.itemId)}</TableCell>
                    <TableCell>
                      {data.suppliers.find((s) => s.id === o.supplierId)?.name}
                    </TableCell>
                    <TableCell>{conditionName(o.condition)}</TableCell>
                    <TableCell>{money(o.unitCost)}</TableCell>
                    <TableCell>{dateLabel(o.observedAt)}</TableCell>
                    <TableCell>
                      {o.reportedStock || "No confirmada"}
                      <small className="cell-detail">{o.evidence}</small>
                    </TableCell>
                  </TableRow>
                ))}
            </DataTable>
          </TabsContent>
          <TabsContent value="catalog">
            <h3>Catálogo de repuestos y servicios</h3>
            <p className="muted-copy">
              Referencias registradas. Consulta las cantidades en Inventario
              propio.
            </p>
            <DataTable
              headers={["Referencia", "Artículo", "Marca", "Tipo / unidad"]}
              empty="Aún no hay artículos."
            >
              {data.items
                .filter((i) => filter(`${i.name} ${i.code} ${i.brand}`))
                .map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.code}</TableCell>
                    <TableCell>
                      <strong>{i.name}</strong>
                    </TableCell>
                    <TableCell>{i.brand || "Sin marca"}</TableCell>
                    <TableCell>
                      {i.kind === "PART" ? "Repuesto" : "Servicio"} · {i.unit}
                    </TableCell>
                  </TableRow>
                ))}
            </DataTable>
          </TabsContent>
          <TabsContent value="movements">
            <h3>Movimientos recientes</h3>
            <DataTable
              headers={[
                "Artículo / sede",
                "Movimiento",
                "Cantidad",
                "Soporte",
                "Acciones",
              ]}
              empty="El primer movimiento aparecerá aquí."
            >
              {data.movements
                .filter((m) => filter(`${itemName(m.itemId)} ${m.reason}`))
                .map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {itemName(m.itemId)}
                      <small className="cell-detail">
                        {locationName(m.locationId)}
                      </small>
                    </TableCell>
                    <TableCell>
                      {{
                        RECEIPT: "Entrada",
                        CONSUMPTION: "Consumo",
                        ADJUSTMENT_IN: "Ajuste entrada",
                        ADJUSTMENT_OUT: "Ajuste salida",
                        REVERSAL: "Reversión",
                      }[m.kind] ?? m.kind}
                    </TableCell>
                    <TableCell>{m.quantity}</TableCell>
                    <TableCell>
                      {m.reason}
                      <small className="cell-detail">
                        {new Date(m.date).toLocaleString("es-CO", {
                          timeZone: "America/Bogota",
                        })}
                      </small>
                    </TableCell>
                    <TableCell>
                      {m.reversed ? (
                        <Badge variant="outline">Revertido</Badge>
                      ) : role === "ADMIN" && m.kind !== "REVERSAL" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDialog({
                              kind: "stock-reversal",
                              title: "Revertir movimiento",
                              extra: { movementId: m.id },
                              fields: [
                                {
                                  key: "reason",
                                  label: "Motivo de la reversión",
                                  type: "textarea",
                                },
                              ],
                            })
                          }
                        >
                          Revertir
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </DataTable>
          </TabsContent>
        </Tabs>
      )}

      <FormSheet
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle className="pr-8 [overflow-wrap:anywhere]">
              {dialog?.title}
            </SheetTitle>
            <SheetDescription>
              {demo
                ? "Cambio de demostración; no afecta datos reales."
                : "Los campos opcionales están indicados."}
            </SheetDescription>
          </SheetHeader>
          {dialog && (
            <OperationForm
              key={`${dialog.kind}-${dialog.title}`}
              dialog={dialog}
              submit={async (values) => {
                await safeRun(dialog.kind, values);
                setDialog(null);
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </section>
  );
}
