"use client";
import {
  ClipboardList as EmptyClipboardList,
  MessageSquare as EmptyMessageSquare,
} from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { AdminNotifications } from "@/features/activity/activity-ui";
import {
  CategoryField,
  OrderCategory,
} from "@/features/categories/category-fields";
import { SettingsWorkspace } from "@/features/attendance/settings-workspace";
import { AttendanceWorkspace } from "@/features/attendance/attendance-workspace";
import { TeamWorkspace } from "@/features/team/team-workspace";
import { InventoryWorkspace } from "@/features/inventory/inventory-workspace";
import { CustomersWorkspace } from "@/features/contacts/customers-workspace";
import { FormSheet } from "./form-sheet";
import { ObservationHistory } from "@/features/orders/observation-history";
import { OrderAgreement } from "@/features/commerce/order-agreement";
import { Attachments } from "@/features/control/attachments";
import { ControlPanel } from "@/features/control/control-panel";
import { AssetSelector } from "@/features/control/asset-selector";
import { CommerceWorkspace } from "@/features/commerce/commerce-workspace";
import { MoneyWorkspace } from "@/features/cash/money-workspace";
import { CustomerPicker } from "@/features/contacts/customer-picker";
import type { CommercialRow } from "@/domain/commercial";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { TaskBadge } from "@/features/tasks/task-status";

import { useOrderCommand } from "@/features/orders/hooks";
import { useWorkshopCommands } from "@/features/workshop/commands";
import {
  WorkshopQueryProvider,
  useWorkshopQuery,
} from "@/features/workshop/query";
import { useEffect, useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";

import Link from "next/link";

import { useSearchParams } from "next/navigation";

import { CashPanel } from "@/features/cash/cash-panel";
import { TasksPanel } from "@/features/tasks/tasks-panel";
import { WorkshopDashboard } from "./workshop-dashboard";

import { OrdersList } from "./orders-list";

import { Choice, DateField } from "./workshop-controls";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AppSidebar,
  workshopSections,
  sectionAvailable,
  sectionTitle,
} from "./app-sidebar";

import { Check, ClipboardList, Clock3, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

import { Textarea } from "@/components/ui/textarea";

import { Separator } from "@/components/ui/separator";

import { statusLabels, type OrderView } from "@/domain/workshop-view";

import type { Role } from "@/domain/permissions";

import { OperationsPanel } from "@/components/operations-panel";

import { OrderControls } from "@/components/order-controls";

import { emptyOperations, type OperationsView } from "@/domain/operations-view";

type Props = {
  initialOperations?: OperationsView;
  initialOrders: OrderView[];
  demo?: boolean;
  localTesting?: boolean;
  actor: { id: string; name: string; role: Role; avatarUrl?: string };
  locations: { id: string; name: string }[];
};

const sections = workshopSections;

export function Workshop(props: Props) {
  return (
    <WorkshopQueryProvider
      key={props.actor.id}
      actorId={props.actor.id}
      demo={props.demo ?? false}
      initial={{
        orders: props.initialOrders,
        operations: props.initialOperations ?? emptyOperations,
        locations: props.locations,
      }}
    >
      <TooltipProvider>
        <SidebarProvider>
          <WorkshopContent {...props} />
        </SidebarProvider>
      </TooltipProvider>
    </WorkshopQueryProvider>
  );
}
function WorkshopContent({ demo = false, localTesting = false, actor }: Props) {
  const query = useWorkshopQuery();
  const { orders, operations, locations } = query.data ?? {
    orders: [],
    operations: emptyOperations,
    locations: [],
  };
  const runOperation = useWorkshopCommands();
  const orderCommand = useOrderCommand();
  const orderRequest = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [orderPurpose, setOrderPurpose] = useState("CUSTOMER_REPAIR");
  const [orderKind, setOrderKind] = useState("VEHICLE");
  const [orderCustomer, setOrderCustomer] = useState("");
  const [receivingQuote, setReceivingQuote] = useState<CommercialRow | null>(
    null,
  );

  const params = useSearchParams();
  const allowed = sections.filter((s) =>
    sectionAvailable(s.label, actor.role, !!demo),
  );
  const section =
    allowed.find((s) => s.label === params.get("view"))?.label ?? "Resumen";

  const [notice, setNotice] = useState("");

  const [error, setError] = useState("");

  const pending = orderCommand.isPending;
  const creatingCategory =
    useIsMutating({ mutationKey: ["category-command"] }) > 0;

  if (!query.data) return <p role="status">Comprobando sesión…</p>;

  const selected = orders.find((o) => o.id === selectedId);

  function navigate(label: string, status?: string) {
    const q = new URLSearchParams();
    q.set("view", label);
    if (status) q.set("status", status);
    window.history.pushState(null, "", `?${q}`);
    setNotice("");
  }

  async function saveNote(form: FormData, element?: HTMLFormElement) {
    if (!selected) return;

    const body = String(form.get("body") ?? "").trim();

    if (!body) return;

    setError("");

    try {
      await orderCommand.mutateAsync({
        kind: "note",
        input: { orderId: selected.id, body },
      });
      element?.reset();

      setNotice(
        demo
          ? "Observación añadida a la demostración. Se pierde al recargar."
          : "Observación guardada.",
      );
    } catch {
      setError("No se pudo guardar. Revisa la conexión y vuelve a intentarlo.");
    }
  }

  async function saveTime(form: FormData, element?: HTMLFormElement) {
    if (!selected) return;

    const taskId = String(form.get("taskId"));
    const minutes = Number(form.get("minutes"));

    const key = String(form.get("requestKey"));
    const note = String(form.get("note"));
    if (!form.get("workedOn")) {
      setError("Selecciona la fecha del trabajo.");
      return;
    }

    setError("");

    try {
      await orderCommand.mutateAsync({
        kind: "time",
        input: {
          taskId,
          minutes,
          note,
          idempotencyKey: key,
          workedOn: String(form.get("workedOn")),
        },
      });
      element?.reset();

      setNotice(
        demo
          ? "Horas añadidas a la demostración. Se pierden al recargar."
          : "Tiempo registrado.",
      );
    } catch {
      setError(
        "No se pudo registrar. Revisa los datos, la asignación y la conexión.",
      );
    }
  }

  async function saveOrder(form: FormData, element?: HTMLFormElement) {
    if (pending || creatingCategory) return;
    const selectedCustomer = String(form.get("customerId") ?? "").replace(
      "__none",
      "",
    );

    const input = {
      quoteId: receivingQuote?.id,
      requestId:
        orderRequest.current ?? (orderRequest.current = crypto.randomUUID()),
      customerId: (demo ? selectedCustomer : orderCustomer) || undefined,
      purpose: orderPurpose,
      businessCategoryId:
        String(form.get("businessCategoryId") ?? "").replace("__none", "") ||
        undefined,
      authorization: String(form.get("authorization") ?? ""),
      title: String(form.get("title")),
      dueAt: String(form.get("dueAt") ?? "") || undefined,
      customer:
        selectedCustomer ||
        (!demo && orderCustomer) ||
        orderPurpose === "OWN_REBUILD"
          ? undefined
          : String(form.get("customer") ?? ""),
      reference: String(form.get("reference")),
      assetId:
        String(form.get("assetId") ?? "").replace("__none", "") || undefined,
      kind: String(form.get("kind")) as "VEHICLE" | "COMPONENT",
      problem: String(form.get("problem")),
      locationId: String(form.get("locationId")),
    };

    if (!demo && !input.businessCategoryId) {
      setError("Selecciona la categoría del trabajo.");
      return;
    }
    setError("");

    try {
      const created = await orderCommand.mutateAsync({ kind: "create", input });
      element?.reset();
      orderRequest.current = null;
      setCreating(false);
      navigate("Órdenes");
      if (created?.id) setSelectedId(created.id);
      setNotice(
        demo
          ? "Orden añadida a la demostración. Se pierde al recargar."
          : "Orden creada.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la orden. Revisa los campos y vuelve a intentarlo.",
      );
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <AppSidebar
        actor={actor}
        section={section}
        navigate={navigate}
        localTesting={localTesting}
      />
      <SidebarInset id="main" className="app-workspace">
        <div className="app-topbar">
          <SidebarTrigger aria-label="Alternar menú lateral" />
          <Separator orientation="vertical" />
          <Breadcrumb aria-label="Ubicación">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <button onClick={() => navigate("Resumen")}>Taller</button>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{sectionTitle(section)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <span className="sync-indicator">
            {query.isFetching ? "Actualizando…" : null}
          </span>
          {actor.role === "ADMIN" && !demo && <AdminNotifications />}
        </div>
        <div className="workspace-content">
          {(localTesting || demo) && (
            <Alert className="demo-alert">
              <AlertTitle>
                {demo ? "Demostración" : "Pruebas locales"}
              </AlertTitle>
              <AlertDescription>
                {demo
                  ? "Datos ficticios. Los cambios se pierden al recargar."
                  : "Datos ficticios guardados en la base local."}{" "}
                <Link href="/login" className="underline">
                  Cambiar usuario
                </Link>
              </AlertDescription>
            </Alert>
          )}
          <header className="workspace-header">
            <h1>
              {section === "Órdenes"
                ? "Órdenes de trabajo"
                : sectionTitle(section)}
            </h1>
          </header>

          {query.isError && (
            <Alert variant="destructive">
              <AlertTitle>{query.error.message}</AlertTitle>
              <Button variant="outline" onClick={() => query.refetch()}>
                Reintentar consulta
              </Button>
            </Alert>
          )}
          {notice && !selected && !creating && (
            <Alert>
              <AlertTitle>{notice}</AlertTitle>
            </Alert>
          )}
          {section === "Resumen" ? (
            <WorkshopDashboard
              orders={orders}
              data={operations}
              role={actor.role}
              openOrder={setSelectedId}
              navigate={navigate}
            />
          ) : section === "Órdenes" ? (
            <OrdersList
              orders={orders}
              openOrder={setSelectedId}
              createAction={
                section === "Órdenes" &&
                actor.role !== "MECHANIC" && (
                  <Button
                    size="default"
                    onClick={() => {
                      setReceivingQuote(null);
                      orderRequest.current = null;
                      setOrderPurpose("CUSTOMER_REPAIR");
                      setOrderCustomer("");
                      setCreating(true);
                      setError("");
                      setNotice("");
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    Nueva orden
                  </Button>
                )
              }
            />
          ) : section === "Tareas" ? (
            <TasksPanel role={actor.role} openOrder={setSelectedId} />
          ) : ["Caja", "Cartera", "Control de caja"].includes(section) ? (
            demo ? (
              <CashPanel role={actor.role} />
            ) : (
              <MoneyWorkspace
                section={section}
                data={operations}
                orders={orders}
                locations={locations}
                role={actor.role}
              />
            )
          ) : ["Cotizaciones", "Ventas"].includes(section) ? (
            <CommerceWorkspace
              section={section}
              data={operations}
              orders={orders}
              locations={locations}
              role={actor.role}
              onOpenOrder={setSelectedId}
              onReceiveQuote={(quote) => {
                setReceivingQuote(quote);
                setOrderPurpose("CUSTOMER_REPAIR");
                setOrderCustomer(quote.customerId);
                setError("");
                orderRequest.current = null;
                setCreating(true);
              }}
            />
          ) : section === "Configuración" && !demo && actor.role === "ADMIN" ? (
            <SettingsWorkspace locations={locations} />
          ) : section === "Mi jornada" && !demo ? (
            <AttendanceWorkspace locations={locations} />
          ) : section === "Equipo" && !demo ? (
            <TeamWorkspace
              section={section}
              data={operations}
              orders={orders}
              locations={locations}
              role={actor.role}
              demo={demo}
              run={runOperation}
              openOrder={setSelectedId}
            />
          ) : [
              "Inventario",
              "Control de inventario",
              "Clientes",
              "Activos",
            ].includes(section) ? (
            ["Inventario", "Control de inventario"].includes(section) ? (
              <InventoryWorkspace
                section={section}
                data={operations}
                orders={orders}
                locations={locations}
                role={actor.role}
                demo={demo}
                run={runOperation}
                openOrder={setSelectedId}
              />
            ) : (
              <CustomersWorkspace
                section={section}
                data={operations}
                orders={orders}
                locations={locations}
                role={actor.role}
                demo={demo}
                run={runOperation}
                openOrder={setSelectedId}
              />
            )
          ) : ["Compras", "Garantías", "Rentabilidad"].includes(section) ? (
            <ControlPanel
              key={section}
              data={operations}
              orders={orders}
              locations={locations}
              role={actor.role}
              resources={
                section === "Compras"
                  ? ["purchases"]
                  : section === "Garantías"
                    ? ["warranties"]
                    : section === "Rentabilidad"
                      ? ["margins"]
                      : actor.role === "ADMIN"
                        ? ["closures", "recurring", "coverage", "audit"]
                        : ["closures", "recurring"]
              }
            />
          ) : (
            <OperationsPanel
              key={section}
              section={section}
              data={operations}
              orders={orders}
              locations={locations}
              role={actor.role}
              demo={demo}
              run={runOperation}
              openOrder={setSelectedId}
            />
          )}
        </div>
      </SidebarInset>

      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              OT-{String(selected?.number ?? 0).padStart(4, "0")} ·{" "}
              {selected?.title}
            </SheetTitle>
            <SheetDescription>
              {selected?.reference} · {selected?.location}
              {demo ? " · Demostración" : ""}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="sheet-body">
              <Badge variant="secondary" data-status={selected.status}>
                {statusLabels[selected.status]}
              </Badge>
              {actor.role !== "MECHANIC" && (
                <OrderControls order={selected} run={runOperation} />
              )}
              <OrderCategory
                key={`${selected.id}-${selected.version}`}
                order={selected}
                canEdit={!demo && actor.role !== "MECHANIC"}
              />
              <dl className="dossier-facts">
                <div>
                  <dt>Cliente</dt>
                  <dd>{selected.customer}</dd>
                </div>
                <div>
                  <dt>Responsable</dt>
                  <dd>{selected.responsible}</dd>
                </div>
              </dl>
              <section>
                <h3>Próximo paso</h3>
                <p>{selected.nextStep}</p>
              </section>
              <section>
                <h3>Motivo de ingreso</h3>
                <p>{selected.problem}</p>
              </section>
              <Separator />
              {!demo && (
                <ControlPanel
                  key={selected.id}
                  data={operations}
                  orders={orders}
                  locations={locations}
                  role={actor.role}
                  resources={
                    actor.role === "MECHANIC"
                      ? ["checks"]
                      : ["checks", "handovers"]
                  }
                  orderId={selected.id}
                />
              )}
              {!demo && actor.role !== "MECHANIC" && (
                <OrderAgreement
                  key={`agreement-${selected.id}`}
                  order={selected}
                />
              )}
              {!demo && (
                <Attachments entityType="ORDER" entityId={selected.id} />
              )}
              <section>
                <h3>Tareas del trabajo</h3>
                {selected.tasks.length ? (
                  <ul className="task-list">
                    {selected.tasks.map((task) => (
                      <li key={task.id}>
                        <ClipboardList aria-hidden="true" />
                        <span>
                          {task.title}
                          <small>{task.minutes} min registrados</small>
                        </span>
                        <TaskBadge status={task.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <DataEmpty
                    icon={EmptyClipboardList}
                    compact
                    title="Sin tareas asignadas"
                    description="Las tareas de esta orden aparecerán junto con su estado y tiempo registrado."
                  />
                )}
              </section>

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
              {notice && (
                <Alert>
                  <Check />
                  <AlertTitle>{notice}</AlertTitle>
                </Alert>
              )}

              {!["CLOSED", "CANCELLED"].includes(selected.status) &&
                selected.tasks.length > 0 && (
                  <TimeForm
                    key={selected.id}
                    tasks={selected.tasks.filter(
                      (t) =>
                        actor.role !== "MECHANIC" ||
                        operations.tasks.some(
                          (assigned) => assigned.id === t.id,
                        ),
                    )}
                    pending={pending}
                    onSubmit={saveTime}
                  />
                )}

              <Separator />
              <section>
                <h3>Observaciones</h3>
                {!["CLOSED", "CANCELLED"].includes(selected.status) && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveNote(new FormData(e.currentTarget), e.currentTarget);
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="observation">
                          Dejar una observación
                        </FieldLabel>
                        <Textarea
                          id="observation"
                          name="body"
                          required
                          maxLength={5000}
                          placeholder="Ej. Se probó en banco: el inyector 3 tiene exceso de retorno."
                        />
                      </Field>
                      <Button type="submit" disabled={pending}>
                        {pending ? "Guardando…" : "Guardar observación"}
                      </Button>
                    </FieldGroup>
                  </form>
                )}
                {!demo ? (
                  <ObservationHistory key={selected.id} orderId={selected.id} />
                ) : selected.notes.length ? (
                  <ol className="observation-list">
                    {selected.notes.map((note) => (
                      <li key={note.id}>
                        <p>{note.body}</p>
                        <small>
                          {note.author} · {note.date}
                        </small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <DataEmpty
                    icon={EmptyMessageSquare}
                    compact
                    title="Sin observaciones"
                    description="Las notas del trabajo aparecerán con su autor y fecha."
                  />
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <FormSheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {receivingQuote
                ? `Recibir trabajo · COT-${receivingQuote.number}`
                : "Nueva orden de trabajo"}
            </SheetTitle>
            <SheetDescription>
              Recepción de un vehículo, componente o unidad propia.
              {demo ? " Los datos solo se guardan en esta demostración." : ""}
            </SheetDescription>
          </SheetHeader>
          <form
            className="sheet-body"
            onChange={() => {
              orderRequest.current = null;
            }}
            onSubmit={(e) => {
              e.preventDefault();
              saveOrder(new FormData(e.currentTarget), e.currentTarget);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="order-title">
                  Vehículo o componente
                </FieldLabel>
                <Input
                  id="order-title"
                  name="title"
                  defaultValue={receivingQuote?.title}
                  required
                  minLength={3}
                  maxLength={250}
                  placeholder="Ej. Bomba de inyección Bosch"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="purpose">Tipo de trabajo</FieldLabel>
                <Choice
                  id="purpose"
                  name="purpose"
                  disabled={!!receivingQuote}
                  value={orderPurpose}
                  onChange={setOrderPurpose}
                  options={[
                    { id: "CUSTOMER_REPAIR", label: "Reparación de cliente" },
                    {
                      id: "OWN_REBUILD",
                      label: "Reconstrucción de unidad propia",
                    },
                  ]}
                />
              </Field>
              {orderPurpose !== "OWN_REBUILD" &&
                (!demo ? (
                  <CustomerPicker
                    id="customerId"
                    value={orderCustomer}
                    onChange={setOrderCustomer}
                    disabled={!!receivingQuote}
                  />
                ) : (
                  <>
                    <Field>
                      <FieldLabel htmlFor="customerId">
                        Cliente existente
                      </FieldLabel>
                      <Choice
                        id="customerId"
                        name="customerId"
                        value={orderCustomer}
                        onChange={setOrderCustomer}
                        options={[
                          { id: "", label: "Cliente nuevo / unidad propia" },
                          ...operations.customers
                            .filter((c) => !c.deletedAt)
                            .map((c) => ({
                              id: c.id,
                              label: c.name,
                            })),
                        ]}
                      />
                    </Field>
                    {!orderCustomer && (
                      <Field>
                        <FieldLabel htmlFor="customer">
                          Nombre del cliente nuevo
                        </FieldLabel>
                        <Input
                          id="customer"
                          name="customer"
                          required
                          minLength={3}
                          maxLength={180}
                        />
                        <FieldDescription>
                          El cliente quedará registrado al crear la orden.
                        </FieldDescription>
                      </Field>
                    )}
                  </>
                ))}

              {!demo && <CategoryField />}
              <Field>
                <FieldLabel htmlFor="kind">Tipo de recepción</FieldLabel>
                <Choice
                  id="kind"
                  name="kind"
                  value={orderKind}
                  onChange={setOrderKind}
                  options={[
                    { id: "VEHICLE", label: "Vehículo" },
                    { id: "COMPONENT", label: "Componente" },
                  ]}
                />
              </Field>

              {!demo && orderCustomer && (
                <AssetSelector
                  key={orderCustomer}
                  customerId={orderCustomer}
                  onKind={setOrderKind}
                />
              )}
              <Field>
                <FieldLabel htmlFor="reference">Placa o serial</FieldLabel>
                <Input id="reference" name="reference" maxLength={20} />
              </Field>

              <Field>
                <FieldLabel htmlFor="location">Sede</FieldLabel>
                <Choice
                  id="location"
                  name="locationId"
                  required
                  options={locations.map((l) => ({ id: l.id, label: l.name }))}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="dueAt">
                  Entrega prevista (opcional)
                </FieldLabel>
                <DateField id="dueAt" name="dueAt" label="Entrega prevista" />
              </Field>
              <Field>
                <FieldLabel htmlFor="authorization">
                  Autorización de trabajo
                </FieldLabel>
                <Textarea
                  id="authorization"
                  name="authorization"
                  defaultValue={
                    receivingQuote
                      ? `Cotización ${receivingQuote.number} aprobada por ${receivingQuote.approvedBy}. ${receivingQuote.approvalNote ?? ""}`
                      : undefined
                  }
                  maxLength={5000}
                  placeholder="Ej. Autoriza diagnóstico. Llamar antes de cambiar repuestos."
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="problem">Motivo de ingreso</FieldLabel>
                <Textarea
                  id="problem"
                  name="problem"
                  required
                  minLength={5}
                  maxLength={5000}
                />
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
              <Button
                type="submit"
                disabled={pending || creatingCategory || locations.length === 0}
              >
                {pending ? "Creando…" : "Crear orden"}
                <Plus data-icon="inline-end" />
              </Button>
            </FieldGroup>
          </form>
        </SheetContent>
      </FormSheet>

      <Toaster theme="light" richColors position="bottom-right" />
    </>
  );
}

function TimeForm({
  tasks,
  pending,
  onSubmit,
}: {
  tasks: OrderView["tasks"];
  pending: boolean;
  onSubmit: (form: FormData, element?: HTMLFormElement) => void;
}) {
  const [requestKey, setRequestKey] = useState("");

  useEffect(() => setRequestKey(crypto.randomUUID()), []);

  return (
    <form
      onReset={() => setRequestKey(crypto.randomUUID())}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget), e.currentTarget);
      }}
    >
      <h3>Registrar tiempo ordinario</h3>
      <p className="text-sm text-muted-foreground">
        El administrador registra las horas extra desde Equipo.
      </p>
      <FieldGroup>
        <input type="hidden" name="requestKey" value={requestKey} />
        <Field>
          <FieldLabel htmlFor="time-task">Tarea</FieldLabel>
          <Choice
            id="time-task"
            name="taskId"
            onChange={() => setRequestKey(crypto.randomUUID())}
            options={tasks.map((t) => ({ id: t.id, label: t.title }))}
          />
        </Field>
        <div className="time-fields">
          <Field>
            <FieldLabel htmlFor="minutes">Minutos trabajados</FieldLabel>
            <Input
              id="minutes"
              name="minutes"
              type="number"
              min={1}
              max={1440}
              required
              placeholder="45"
              onChange={() => setRequestKey(crypto.randomUUID())}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="workedOn">Fecha del trabajo</FieldLabel>
            <DateField
              id="workedOn"
              name="workedOn"
              required
              onChange={() => setRequestKey(crypto.randomUUID())}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="time-note">Trabajo realizado</FieldLabel>
          <Input
            id="time-note"
            name="note"
            required
            maxLength={1000}
            onChange={() => setRequestKey(crypto.randomUUID())}
          />
        </Field>
        <Button
          type="submit"
          variant="outline"
          disabled={pending || !requestKey}
        >
          Registrar tiempo
          <Clock3 data-icon="inline-end" />
        </Button>
      </FieldGroup>
    </form>
  );
}
