"use client";
import { SortButton } from "@/components/sortable-head";
import { TablePagination } from "@/components/workshop-controls";
import { SearchX as EmptySearchX, Wallet as EmptyWallet } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Decimal from "decimal.js";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useTeamRequest, useTeamCommand } from "./hooks";
import { type PayrollPreview } from "@/domain/employee-benefits";
import { type OperationsView } from "@/domain/operations-view";
import { type Role } from "@/domain/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FormSheet, useFormSheet } from "@/components/form-sheet";
import { RowActions } from "@/components/row-actions";
import { RecordStamp } from "@/features/activity/activity-ui";
import {
  Choice,
  MonthField,
  DateField,
  dateLabel,
} from "@/components/workshop-controls";
import { todayInBogota, cop } from "@/features/cash/summary";
type PayrollRow = PayrollPreview["rows"][number];
type Earlier = NonNullable<PayrollPreview["unassigned"]>[number];
type PayDialog = { rows: PayrollRow[]; existing?: Earlier };

export function PayrollWorkspace({
  data,
  role,
  onAdvances,
}: {
  data: OperationsView;
  role: Role;
  onAdvances: (id: string) => void;
}) {
  const params = useSearchParams();
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("period") ?? "")
    ? params.get("period")!
    : todayInBogota().slice(0, 7);
  const orderBy = params.get("orderBy") ?? "name",
    direction = params.get("direction") ?? "asc";
  const query = useTeamRequest<PayrollPreview>(
      new URLSearchParams({ resource: "payroll", period, orderBy, direction }),
    ),
    command = useTeamCommand();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [dialog, setDialog] = useState<PayDialog | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [reversal, setReversal] = useState<PayrollRow["payments"][number] | null>(
      null,
    ),
    [adopt, setAdopt] = useState("");
  const rows =
    query.data?.rows.filter((r) =>
      r.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
    ) ?? [];
  const payableRows = rows.filter(
    (r) => Number(r.remaining) > 0 && Number(r.payable) >= 0,
  );
  const chosen = payableRows.filter((r) => selected.includes(r.memberId));
  const total = (
    key:
      | "salary"
      | "bonuses"
      | "leaveDeduction"
      | "installments"
      | "paid"
      | "remaining",
  ) =>
    query.data?.rows
      .reduce((s, r) => s.plus(r[key] ?? 0), new Decimal(0))
      .toFixed(2) ?? "0";
  const employee = query.data?.rows.find((r) => r.memberId === detail);
  const all = payableRows.length > 0 && chosen.length === payableRows.length;
  const unassigned = !!query.data?.unassigned?.length;
  function sort(key: string) {
    const next = new URLSearchParams(params);
    next.set("orderBy", key);
    next.set(
      "direction",
      orderBy === key && direction === "asc" ? "desc" : "asc",
    );
    window.history.replaceState(null, "", `?${next}`);
  }
  const head = (key: string, label: string) => (
    <TableHead
      aria-sort={
        orderBy === key
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <SortButton
        active={orderBy === key}
        direction={direction}
        onClick={() => sort(key)}
      >
        {label}
      </SortButton>
    </TableHead>
  );
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Pago del mes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Revisa el cálculo y registra lo que entregas a cada empleado.
          </p>
        </div>
        <Field className="w-auto">
          <FieldLabel htmlFor="salary-period">Mes</FieldLabel>
          <MonthField
            id="salary-period"
            value={period}
            onChange={(v) => {
              setSelected([]);
              setPage(1);
              const q = new URLSearchParams({
                view: "Equipo",
                teamTab: "payroll",
                period: v,
              });
              window.history.replaceState(null, "", `?${q}`);
            }}
          />
        </Field>
      </div>
      {query.isPending && <p>Consultando pagos…</p>}
      {query.error && (
        <Alert variant="destructive">
          <AlertTitle>{query.error.message}</AlertTitle>
        </Alert>
      )}
      {query.data && (
        <>
          <dl className="team-cost-summary">
            <div>
              <dt>Salarios y bonos</dt>
              <dd>
                {cop(
                  new Decimal(total("salary"))
                    .plus(total("bonuses"))
                    .toString(),
                )}
              </dd>
              <p>
                {cop(
                  new Decimal(total("leaveDeduction"))
                    .plus(total("installments"))
                    .toString(),
                )}{" "}
                de descuentos
              </p>
            </div>
            <div>
              <dt>Pagado a empleados</dt>
              <dd>{cop(total("paid"))}</dd>
              <p>Pagos y abonos registrados para este mes</p>
            </div>
            <div>
              <dt>Falta por pagar</dt>
              <dd>{cop(total("remaining"))}</dd>
              <p>Después de permisos y cuotas de anticipos</p>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Cada pago descuenta dinero de la cuenta elegida. Al completar el
            pago del empleado se aplican sus cuotas de anticipos, sin otra
            salida de caja. Los aportes y prestaciones se registran en Dinero.
          </p>
          {query.data.rows.some(
            (r) => r.payable === null || Number(r.payable) < 0,
          ) && (
            <Alert>
              <AlertTitle>Hay cálculos por revisar</AlertTitle>
              <AlertDescription>
                Configura los salarios pendientes y revisa los descuentos que
                superen el salario. Esos empleados no se pueden seleccionar para
                pagar.
              </AlertDescription>
            </Alert>
          )}
          {unassigned && (
            <Alert>
              <AlertTitle>Pagos anteriores por asignar</AlertTitle>
              <AlertDescription>
                El dinero ya salió de caja. Indica a qué empleados correspondió
                antes de registrar nuevos pagos.
              </AlertDescription>
              <div className="mt-3 flex flex-wrap gap-2">
                {query.data.unassigned!.map((e) => (
                  <Button
                    key={e.id}
                    variant="outline"
                    onClick={() =>
                      setDialog({ rows: payableRows, existing: e })
                    }
                  >
                    {cop(e.amount)} · {dateLabel(e.occurredOn)} · Asignar
                  </Button>
                ))}
              </div>
            </Alert>
          )}
          {role === "ADMIN" &&
            !!query.data.legacyObligations?.length &&
            !data.obligations.some((o) => o.salaryPeriod === period) && (
              <div className="flex flex-wrap items-end gap-3">
                <Field className="max-w-md">
                  <FieldLabel>
                    Gasto de salarios registrado antes de este flujo
                  </FieldLabel>
                  <Choice
                    label="Gasto de salarios anterior"
                    value={adopt}
                    options={query.data.legacyObligations!.map((o) => ({
                      id: o.id,
                      label: `${o.title} · ${cop(o.amount)}`,
                    }))}
                    onChange={setAdopt}
                  />
                </Field>
                <Button
                  variant="outline"
                  disabled={!adopt || command.isPending}
                  onClick={() =>
                    command.mutate(
                      {
                        kind: "payroll-adopt",
                        input: {
                          requestId: crypto.randomUUID(),
                          period,
                          obligationId: adopt,
                        },
                      },
                      {
                        onSuccess: () => {
                          setAdopt("");
                          toast.success(
                            "Gasto vinculado. Revisa los pagos anteriores.",
                          );
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  Usar como gasto de salarios
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  Selecciona solo salarios de empleados. Conserva aportes y
                  prestaciones como gastos separados.
                </p>
              </div>
            )}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Buscar empleado en pago del mes"
              placeholder="Buscar empleado"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                setSelected([]);
              }}
              className="max-w-sm"
            />
            <Button
              variant="outline"
              disabled={!payableRows.length}
              onClick={() =>
                setSelected(all ? [] : payableRows.map((r) => r.memberId))
              }
            >
              <CheckCheck />
              {all ? "Quitar selección" : "Seleccionar todos los pendientes"}
            </Button>
            <Button
              disabled={!chosen.length || unassigned}
              onClick={() => setDialog({ rows: chosen })}
            >
              Pagar seleccionados{chosen.length ? ` (${chosen.length})` : ""}
            </Button>
            {!!chosen.length && (
              <span className="text-sm text-muted-foreground">
                {cop(
                  chosen
                    .reduce((s, r) => s.plus(r.remaining!), new Decimal(0))
                    .toString(),
                )}
              </span>
            )}
          </div>
          <div className="data-panel">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      aria-label="Seleccionar todos los empleados pendientes de la búsqueda"
                      checked={
                        all ? true : chosen.length ? "indeterminate" : false
                      }
                      disabled={!payableRows.length}
                      onCheckedChange={(v) =>
                        setSelected(v ? payableRows.map((r) => r.memberId) : [])
                      }
                    />
                  </TableHead>
                  {head("name", "Empleado")}
                  {head("salary", "Salario")}
                  {head("bonuses", "Bonos")}
                  {head("leaveDeduction", "Permisos")}
                  {head("installments", "Anticipos")}
                  {head("paid", "Pagado")}
                  {head("remaining", "Por pagar")}
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice((page - 1) * 10, page * 10).map((r) => (
                  <TableRow key={r.memberId}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Seleccionar a ${r.name}`}
                        checked={selected.includes(r.memberId)}
                        disabled={!payableRows.includes(r)}
                        onCheckedChange={(v) =>
                          setSelected(
                            v
                              ? [...selected, r.memberId]
                              : selected.filter((id) => id !== r.memberId),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => setDetail(r.memberId)}
                      >
                        {r.name}
                      </Button>
                      <div>
                        <RecordStamp id={r.memberId} />
                      </div>
                    </TableCell>
                    <TableCell className="money-cell">
                      {r.salary === null ? "Sin configurar" : cop(r.salary)}
                    </TableCell>
                    <TableCell className="money-cell">
                      {cop(r.bonuses)}
                    </TableCell>
                    <TableCell className="money-cell">
                      {cop(r.leaveDeduction)}
                    </TableCell>
                    <TableCell className="money-cell">
                      {cop(r.installments)}
                    </TableCell>
                    <TableCell className="money-cell">{cop(r.paid)}</TableCell>
                    <TableCell className="money-cell">
                      <strong>
                        {r.payable === null
                          ? "Sin configurar"
                          : Number(r.payable) < 0
                            ? "Revisar descuentos"
                            : cop(r.remaining!)}
                      </strong>
                      <div>
                        <Badge
                          variant={
                            Number(r.remaining) === 0 && Number(r.payable) > 0
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {r.payable === null || Number(r.payable) < 0
                            ? "Por revisar"
                            : Number(r.payable) === 0
                              ? "Sin pago pendiente"
                              : Number(r.remaining) === 0
                                ? "Pagado"
                                : Number(r.paid) > 0
                                  ? "Abonado"
                                  : "Pendiente"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RowActions
                        name={r.name}
                        actions={[
                          {
                            label: "Registrar pago",
                            disabled: !payableRows.includes(r) || unassigned,
                            run: () => setDialog({ rows: [r] }),
                          },
                          {
                            label: "Ver pagos y cálculo",
                            run: () => setDetail(r.memberId),
                          },
                          {
                            label: "Ver anticipos y cuotas",
                            run: () => onAdvances(r.memberId),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <DataEmpty
                        icon={EmptySearchX}
                        title="Sin empleados para esta consulta"
                        description="Prueba con otro nombre o correo."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              total={rows.length}
              page={page}
              pageSize={10}
              onPageChange={setPage}
            />
          </div>
        </>
      )}
      <FormSheet
        open={!!dialog}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {dialog?.existing ? "Asignar pago anterior" : "Registrar pagos"}
            </SheetTitle>
            <SheetDescription>
              {dialog?.existing
                ? "Distribuye el movimiento entre los empleados. No se mueve dinero de nuevo."
                : "Confirma la cuenta, la fecha y cuánto vas a entregar a cada empleado."}
            </SheetDescription>
          </SheetHeader>
          {dialog && (
            <PayForm
              key={period + dialog.rows.map((r) => r.memberId).join()}
              dialog={dialog}
              period={period}
              accounts={data.accounts}
              done={() => {
                setDialog(null);
                setSelected([]);
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
      <Sheet
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>{employee?.name ?? "Pagos del empleado"}</SheetTitle>
            <SheetDescription>
              Pagos y abonos del mes {period}.
            </SheetDescription>
          </SheetHeader>
          {employee && (
            <div className="sheet-body flex flex-col gap-5">
              <dl className="flex flex-col gap-2">
                <div>
                  Salario:{" "}
                  <strong>
                    {employee.salary === null
                      ? "Sin configurar"
                      : cop(employee.salary)}
                  </strong>
                </div>
                <div>
                  Bonos: <strong>{cop(employee.bonuses)}</strong>
                </div>
                <div>
                  Permisos: <strong>−{cop(employee.leaveDeduction)}</strong>
                </div>
                <div>
                  Anticipos: <strong>−{cop(employee.installments)}</strong>
                </div>
                <div>
                  Pago del mes:{" "}
                  <strong>
                    {employee.payable === null
                      ? "Sin configurar"
                      : cop(employee.payable)}
                  </strong>
                </div>
                <div>
                  Por pagar: <strong>{cop(employee.remaining ?? 0)}</strong>
                </div>
              </dl>
              <RecordStamp id={employee.memberId} />
              <h3 className="font-semibold">Historial de pagos</h3>
              {!employee.payments.length && (
                <DataEmpty
                  icon={EmptyWallet}
                  compact
                  title="Sin pagos en este mes"
                  description="Los pagos y abonos del empleado aparecerán con su fecha y cuenta de salida."
                />
              )}
              {employee.payments.map((p) => (
                <section
                  key={p.id}
                  className="flex flex-col gap-2 border-b pb-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong>{cop(p.amount)}</strong>
                    <Badge variant={p.reversed ? "outline" : "secondary"}>
                      {p.reversed ? "Revertido" : "Registrado"}
                    </Badge>
                    {role === "ADMIN" && !p.reversed && (
                      <RowActions
                        name={`Pago del ${dateLabel(p.occurredOn)}`}
                        actions={[
                          {
                            label: "Revertir pago",
                            danger: true,
                            run: () => setReversal(p),
                          },
                        ]}
                      />
                    )}
                  </div>
                  <p>
                    {dateLabel(p.occurredOn)} · {p.account}
                  </p>
                  <p className="text-sm">{p.note}</p>
                  <p className="text-xs text-muted-foreground">
                    Registró {p.author} · {dateLabel(p.createdAt)}
                  </p>
                  <RecordStamp id={p.entryId} />
                </section>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <FormSheet
        open={!!reversal}
        onOpenChange={(v) => {
          if (!v) setReversal(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>Revertir pago de salario</SheetTitle>
            <SheetDescription>
              Registra la devolución a la cuenta original. Si el movimiento
              cubría a varios empleados, se revierten todos sus pagos.
            </SheetDescription>
          </SheetHeader>
          {reversal && (
            <ReverseForm payment={reversal} done={() => setReversal(null)} />
          )}
        </SheetContent>
      </FormSheet>
    </>
  );
}

function PayForm({
  dialog,
  period,
  accounts,
  done,
}: {
  dialog: PayDialog;
  period: string;
  accounts: OperationsView["accounts"];
  done: () => void;
}) {
  const command = useTeamCommand(),
    sheet = useFormSheet();
  const [requestId] = useState(() => crypto.randomUUID()),
    [account, setAccount] = useState(
      dialog.existing?.accountId ?? accounts[0]?.id ?? "",
    ),
    [date, setDate] = useState(dialog.existing?.occurredOn ?? todayInBogota()),
    [note, setNote] = useState(
      dialog.existing
        ? "Asignación de pago salarial registrado anteriormente"
        : "Pago de salarios del mes",
    ),
    [amounts, setAmounts] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        dialog.rows.map((r) => [
          r.memberId,
          dialog.existing ? "" : r.remaining!,
        ]),
      ),
    );
  const chosen = dialog.rows.filter((r) => Number(amounts[r.memberId]) > 0);
  const total = chosen.reduce(
    (s, r) => s.plus(amounts[r.memberId]),
    new Decimal(0),
  );
  const available = new Decimal(
    dialog.existing?.amount ??
      accounts.find((a) => a.id === account)?.balance ??
      0,
  );
  const shortfall = Decimal.max(0, total.minus(available));
  const excessive = chosen.some((r) =>
    new Decimal(amounts[r.memberId]).gt(r.remaining!),
  );
  return (
    <form
      className="sheet-body operation-form"
      onChangeCapture={() => sheet.change()}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await command.mutateAsync({
            kind: "payroll-pay",
            input: {
              requestId,
              period,
              accountId: account,
              occurredOn: date,
              note,
              existingEntryId: dialog.existing?.id,
              rows: chosen.map((r) => ({
                memberId: r.memberId,
                fingerprint: r.fingerprint,
                amount: amounts[r.memberId],
              })),
            },
          });
          sheet.saved();
          done();
          toast.success(
            dialog.existing
              ? "Pago anterior asignado."
              : "Pagos registrados en caja.",
          );
        } catch {}
      }}
    >
      <p className="text-lg font-semibold">
        {chosen.length} {chosen.length === 1 ? "empleado" : "empleados"} · Total{" "}
        {cop(total.toString())}
      </p>
      {shortfall.gt(0) && (
        <Alert variant="destructive">
          <AlertTitle>
            {dialog.existing
              ? "La asignación supera el movimiento anterior."
              : `Faltan ${cop(shortfall.toString())} en la cuenta elegida.`}
          </AlertTitle>
          <AlertDescription>
            Revisa los importes o selecciona otra cuenta.
          </AlertDescription>
        </Alert>
      )}
      {excessive && (
        <Alert variant="destructive">
          <AlertTitle>Un importe supera lo pendiente del empleado.</AlertTitle>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel>Cuenta</FieldLabel>
          <Choice
            label="Cuenta del pago"
            value={account}
            onChange={(v) => {
              if (!dialog.existing) {
                setAccount(v);
                sheet.change();
              }
            }}
            options={accounts
              .filter(
                (a) => !dialog.existing || a.id === dialog.existing.accountId,
              )
              .map((a) => ({
                id: a.id,
                label: `${a.name} · ${cop(a.balance)}`,
              }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-date">Fecha de pago</FieldLabel>
          <DateField
            id="payment-date"
            value={date}
            onChange={(v) => {
              if (!dialog.existing) {
                setDate(v);
                sheet.change();
              }
            }}
          />
        </Field>
        {dialog.existing && (
          <p className="text-sm">
            Importe disponible para asignar:{" "}
            <strong>{cop(dialog.existing.amount)}</strong>
          </p>
        )}
        {dialog.rows.map((r) => (
          <Field key={r.memberId}>
            <FieldLabel htmlFor={`pay-${r.memberId}`}>
              {r.name} · Pendiente {cop(r.remaining!)}
            </FieldLabel>
            <Input
              id={`pay-${r.memberId}`}
              inputMode="decimal"
              value={amounts[r.memberId]}
              onChange={(e) => {
                if (/^\d*(\.\d{0,2})?$/.test(e.target.value))
                  setAmounts({ ...amounts, [r.memberId]: e.target.value });
              }}
              placeholder="0"
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor="payment-note">
            Observación o comprobante
          </FieldLabel>
          <Textarea
            id="payment-note"
            required
            minLength={5}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </FieldGroup>
      <p className="text-lg font-semibold">Total: {cop(total.toString())}</p>
      {command.error && (
        <Alert variant="destructive">
          <AlertTitle>{command.error.message}</AlertTitle>
        </Alert>
      )}
      <Button
        type="submit"
        disabled={
          command.isPending ||
          !chosen.length ||
          !account ||
          shortfall.gt(0) ||
          excessive
        }
      >
        {command.isPending
          ? "Registrando…"
          : dialog.existing
            ? "Confirmar asignación"
            : `Confirmar ${chosen.length === 1 ? "pago" : `${chosen.length} pagos`}`}
      </Button>
    </form>
  );
}
function ReverseForm({
  payment,
  done,
}: {
  payment: PayrollRow["payments"][number];
  done: () => void;
}) {
  const command = useTeamCommand(),
    sheet = useFormSheet();
  const [requestId] = useState(() => crypto.randomUUID()),
    [date, setDate] = useState(todayInBogota()),
    [reason, setReason] = useState("");
  return (
    <form
      className="sheet-body operation-form"
      onChangeCapture={() => sheet.change()}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await command.mutateAsync({
            kind: "payroll-reverse",
            input: {
              requestId,
              entryId: payment.entryId,
              occurredOn: date,
              reason,
            },
          });
          sheet.saved();
          done();
          toast.success("Pago revertido y saldo actualizado.");
        } catch {}
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Fecha de devolución</FieldLabel>
          <DateField
            value={date}
            onChange={(v) => {
              setDate(v);
              sheet.change();
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="reverse-reason">Motivo</FieldLabel>
          <Textarea
            id="reverse-reason"
            required
            minLength={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </FieldGroup>
      {command.error && (
        <Alert variant="destructive">
          <AlertTitle>{command.error.message}</AlertTitle>
        </Alert>
      )}
      <Button variant="destructive" disabled={command.isPending}>
        Confirmar reversión
      </Button>
    </form>
  );
}
