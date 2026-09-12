"use client";
import { RowActions } from "@/components/row-actions";
import { useCommercialCommand } from "@/features/commerce/hooks";
import { useWorkshopQuery, useWorkshopScope } from "@/features/workshop/query";
import { useControlCommand } from "@/features/control/hooks";
import { accountNames } from "@/domain/accounts";
import { FormSheet } from "@/components/form-sheet";
import { DataTable } from "@/components/data-table";
import { OperationForm, type Dialog } from "@/components/operation-form";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FilterBar,
  ClearFilters,
  Choice,
  dateLabel,
  DateRangePicker,
  inDates,
  matches,
  useQueryState,
} from "@/components/workshop-controls";
import { cashKinds, obligationCategories } from "@/domain/cash";
import type { OperationsView } from "@/domain/operations-view";
import type { Role } from "@/domain/permissions";
import Decimal from "decimal.js";
import { ArrowLeftRight, Plus, ReceiptText, Undo2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FinancialOverview } from "./financial-overview";
import { useCash, useCashMutation } from "./hooks";
import { cop, todayInBogota } from "./summary";

export function CashPanel({
  role,
  fixedTab,
}: {
  role: Role;
  fixedTab?: "obligations" | "entries" | "accounts";
}) {
  const { demo } = useWorkshopScope();
  const { data: cash } = useCash();
  const mutation = useCashMutation();
  const control = useControlCommand();
  const commerce = useCommercialCommand();
  const { data: customers = [] } = useWorkshopQuery(
    (s) => s.operations.customers,
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [sortTable] = useQueryState("table");
  const [period, setPeriod] = useQueryState(
      "period",
      todayInBogota().slice(0, 7),
    ),
    [queryTab, setTab] = useQueryState("cashTab", "obligations"),
    [q, setQ] = useQueryState("q"),
    [status, setStatus] = useQueryState("status", "ALL"),
    [from, setFrom] = useQueryState("from"),
    [to, setTo] = useQueryState("to"),
    [min, setMin] = useQueryState("min"),
    [max, setMax] = useQueryState("max");
  const tab = fixedTab ?? queryTab;
  const [reviewLegacy, setReviewLegacy] = useState(false);
  if (!cash) return null;
  const accountOptions = [...cash.accounts]
    .sort(
      (a, b) => Number(Number(b.balance) > 0) - Number(Number(a.balance) > 0),
    )
    .map((a) => ({
      id: a.id,
      label: `${a.name} · ${cop(a.balance)}`,
    }));
  const transferForm: Dialog = {
    kind: "cash-transfer",
    title: "Transferir entre cuentas",
    submitLabel: "Transferir dinero",
    description:
      "El dinero saldrá de la cuenta de origen y entrará en la de destino. El saldo total del taller se conserva.",
    extra: {
      sourceAccountId: accountOptions[0]?.id,
      destinationAccountId: accountOptions[1]?.id,
      occurredOn: todayInBogota(),
    },
    fields: [
      {
        key: "sourceAccountId",
        label: "Cuenta de origen",
        type: "select",
        options: accountOptions,
      },
      {
        key: "destinationAccountId",
        label: "Cuenta de destino",
        type: "select",
        options: accountOptions,
        hint: "Debe ser diferente a la cuenta de origen.",
      },
      { key: "amount", label: "Valor COP", type: "money" },
      { key: "occurredOn", label: "Fecha de transferencia", type: "date" },
      { key: "reference", label: "Comprobante / referencia", optional: true },
      { key: "note", label: "Motivo", type: "textarea" },
    ],
  };
  const entryLabel = (e: OperationsView["cashEntries"][number]) =>
    e.transferId
      ? e.kind === "REVERSAL"
        ? "Reversión de transferencia"
        : e.direction === "OUT"
          ? "Transferencia enviada"
          : "Transferencia recibida"
      : e.kind === "REVERSAL"
        ? "Reversión"
        : e.kind === "SALARY_ADVANCE"
          ? "Anticipo de salario"
          : cashKinds[e.kind as keyof typeof cashKinds]?.label;
  const cashForm: Dialog = {
    kind: "cash",
    title: "Registrar entrada o salida",
    submitLabel: "Registrar movimiento",
    description:
      "El valor se sumará o descontará de la cuenta seleccionada según el tipo de movimiento.",
    extra: { occurredOn: todayInBogota() },
    fields: [
      {
        key: "accountId",
        label: "Cuenta",
        type: "select",
        options: accountOptions,
      },
      {
        key: "kind",
        label: "Tipo de movimiento",
        type: "select",
        options: Object.entries(cashKinds)
          .filter(
            ([id]) =>
              ![
                "CUSTOMER_PAYMENT",
                "CUSTOMER_ADVANCE",
                "CUSTOMER_REFUND",
                "SUPPLIER_PAYMENT",
              ].includes(id),
          )
          .filter(
            ([id]) =>
              role === "ADMIN" ||
              ![
                "OWNER_WITHDRAWAL",
                "OWNER_CONTRIBUTION",
                "LOAN_RECEIVED",
                "LOAN_PAYMENT",
              ].includes(id),
          )
          .map(([id, k]) => ({ id, label: k.label })),
      },
      { key: "amount", type: "money", label: "Valor COP" },
      { key: "counterparty", label: "Cliente, proveedor o beneficiario" },
      { key: "occurredOn", label: "Fecha del movimiento", type: "date" },
      { key: "reference", label: "Comprobante / referencia", optional: true },
      { key: "note", label: "Concepto", type: "textarea" },
    ],
  };
  const correct = (o: OperationsView["obligations"][number]) =>
    setDialog({
      kind: "obligation-correct",
      title: "Confirmar importe del gasto",
      description:
        "Revisa el importe real y la fecha de vencimiento antes de confirmar el mes.",
      extra: { obligationId: o.id, amount: o.amount, dueOn: o.dueOn },
      fields: [
        { key: "amount", label: "Importe confirmado (COP)", type: "money" },
        { key: "dueOn", label: "Vencimiento", type: "date" },
        { key: "note", label: "Motivo de la corrección", type: "textarea" },
      ],
    });
  const pay = (o: OperationsView["obligations"][number]) =>
    setDialog({
      kind: "cash",
      title: `Pagar ${o.title}`,
      submitLabel: "Registrar pago",
      description:
        "El pago se descontará de la cuenta seleccionada y reducirá el saldo pendiente de este gasto.",
      extra: {
        obligationId: o.id,
        kind: "EXPENSE_PAYMENT",
        amount: new Decimal(o.amount).minus(o.paid).toFixed(2),
        counterparty: o.title,
        occurredOn: todayInBogota(),
        note: `Pago de ${o.title} · ${o.period}`,
      },
      fields: [
        {
          key: "accountId",
          label: "Pagar desde",
          type: "select",
          options: accountOptions,
        },
        {
          key: "amount",
          type: "money",
          label: "Valor a pagar COP",
          hint: `Saldo pendiente: ${cop(new Decimal(o.amount).minus(o.paid).toString())}. Puedes registrar un abono.`,
        },
        { key: "counterparty", label: "Beneficiario" },
        { key: "occurredOn", label: "Fecha de pago", type: "date" },
        { key: "reference", label: "Comprobante / referencia", optional: true },
        { key: "note", label: "Concepto", type: "textarea" },
      ],
    });
  const reverse = (entry: OperationsView["cashEntries"][number]) =>
    setDialog({
      kind: "cash-reversal",
      title: entry.transferId
        ? "Revertir transferencia"
        : "Revertir pago o movimiento",
      submitLabel: entry.transferId
        ? "Revertir transferencia"
        : "Revertir movimiento",
      description: entry.transferId
        ? "Se devolverá el dinero a la cuenta de origen. Se revertirán ambos movimientos y se conservará el historial."
        : "Se registrará un movimiento contrario. El original se conserva en el historial.",
      extra: { entryId: entry.id, occurredOn: todayInBogota() },
      fields: [
        {
          key: "reason",
          label: "Motivo de la reversión",
          type: "textarea",
          hint: entry.transferId
            ? `Se devolverán ${cop(entry.amount)} entre las dos cuentas.`
            : `Se registrará la contrapartida de ${cop(entry.amount)} en ${cash.accounts.find((a) => a.id === entry.accountId)?.name}.`,
        },
        { key: "occurredOn", label: "Fecha de reversión", type: "date" },
      ],
    });
  const obligationForm: Dialog = {
    kind: "obligation",
    title: "Registrar gasto por pagar",
    submitLabel: "Registrar gasto",
    description:
      "Quedará pendiente de pago. El dinero se descontará de una cuenta cuando registres un abono.",
    extra: { period },
    fields: [
      { key: "title", label: "Concepto" },
      {
        key: "category",
        label: "Categoría",
        type: "select",
        options: Object.entries(obligationCategories)
          .filter(([id]) => role === "ADMIN" || id !== "PAYROLL")
          .map(([id, label]) => ({ id, label })),
      },
      { key: "period", label: "Período", hint: "AAAA-MM" },
      { key: "amount", type: "money", label: "Valor total COP" },
      { key: "dueOn", label: "Vencimiento", type: "date" },
    ],
  };
  const accountForm: Dialog = {
    kind: "account",
    title: "Crear cuenta",
    submitLabel: "Crear cuenta",
    description:
      "Indica el dinero disponible al comenzar el registro de esta caja o banco.",
    fields: [
      {
        key: "name",
        label: "Cuenta",
        type: "select",
        options: accountNames
          .filter((name) => !cash.accounts.some((a) => a.name === name))
          .map((name) => ({ id: name, label: name })),
      },
      {
        key: "openingBalance",
        label: "Saldo inicial COP",
        type: "money",
        allowZero: true,
      },
    ],
  };
  const paymentState = (o: OperationsView["obligations"][number]) =>
    new Decimal(o.paid).gte(o.amount)
      ? "paid"
      : o.dueOn < todayInBogota()
        ? "overdue"
        : new Decimal(o.paid).gt(0)
          ? "partial"
          : "pending";
  const stateLabels = {
    paid: "Pagado",
    overdue: "Vencido",
    partial: "Abono parcial",
    pending: "Pendiente",
  };
  const obligations = cash.obligations.filter(
    (o) =>
      o.period === period &&
      matches(o.title, q) &&
      (status === "ALL" || paymentState(o) === status),
  );
  if (sortTable !== "obligations")
    obligations.sort(
      (a, b) =>
        Number(paymentState(a) === "paid") -
          Number(paymentState(b) === "paid") || a.dueOn.localeCompare(b.dueOn),
    );
  const entries = cash.entries.filter(
    (e) =>
      matches(
        `${e.counterparty} ${e.note} ${e.reference} ${cash.accounts.find((a) => a.id === e.accountId)?.name}`,
        q,
      ) &&
      inDates(e.occurredOn, from, to) &&
      (!min || Number(e.amount) >= Number(min)) &&
      (!max || Number(e.amount) <= Number(max)) &&
      (status === "ALL" ||
        (status === "TRANSFERS" ? !!e.transferId : e.direction === status)),
  );
  const linkPayment = (e: OperationsView["cashEntries"][number]) =>
    setDialog({
      kind: "link-payment",
      title: "Completar datos de un cobro antiguo",
      submitLabel: "Guardar cliente del cobro",
      description:
        "Este movimiento ya está en la cuenta. Identifica al cliente para que aparezca en su saldo, sin volver a cobrar.",
      extra: {
        existingEntryId: e.id,
        amount: e.amount,
        occurredOn: e.occurredOn,
        note: e.note || "Cobro registrado previamente",
        reference: e.reference,
      },
      fields: [
        {
          key: "customerId",
          label: "Cliente",
          type: "select",
          options: customers.map((c) => ({ id: c.id, label: c.name })),
        },
      ],
    });
  const canLink = (e: OperationsView["cashEntries"][number]) =>
    reviewLegacy &&
    role === "ADMIN" &&
    !demo &&
    !e.paymentId &&
    !e.reversed &&
    ["CUSTOMER_PAYMENT", "CUSTOMER_ADVANCE"].includes(e.kind);
  const mobileEntries = (rows: typeof entries) =>
    rows.map((e) => (
      <li key={e.id} className="mobile-cash-row">
        <header>
          <Badge
            variant="outline"
            data-payment-state={e.direction === "IN" ? "paid" : "pending"}
          >
            {entryLabel(e)}
          </Badge>
          <strong className="money-cell">
            {e.direction === "IN" ? "+" : "−"}
            {cop(e.amount)}
          </strong>
        </header>
        <strong>{e.counterparty}</strong>
        <small>
          {dateLabel(e.occurredOn)} ·{" "}
          {cash.accounts.find((a) => a.id === e.accountId)?.name}
        </small>
        <p>{[e.reference, e.note].filter(Boolean).join(" · ")}</p>
        <footer>
          <RowActions
            name={e.reference || e.counterparty}
            actions={[
              ...(canLink(e)
                ? [{ label: "Completar datos", run: () => linkPayment(e) }]
                : []),
              ...(role === "ADMIN" && !e.reversed && e.kind !== "REVERSAL"
                ? [
                    e.kind === "SALARY_ADVANCE"
                      ? {
                          label: "Ver anticipos",
                          run: () =>
                            window.history.pushState(
                              null,
                              "",
                              "?view=Equipo&teamTab=advances",
                            ),
                        }
                      : {
                          label: "Revertir",
                          danger: true,
                          run: () => reverse(e),
                        },
                  ]
                : []),
            ]}
          />
        </footer>
      </li>
    ));
  const entryRows = (rows: typeof entries) =>
    rows.map((e) => (
      <TableRow key={e.id}>
        <TableCell>
          {dateLabel(e.occurredOn)}
          <small className="cell-detail">
            {cash.accounts.find((a) => a.id === e.accountId)?.name}
          </small>
        </TableCell>
        <TableCell>
          {e.counterparty}
          <small className="cell-detail">
            {e.reference} · {e.note}
          </small>
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            data-payment-state={e.direction === "IN" ? "paid" : "pending"}
          >
            {entryLabel(e)}
          </Badge>
        </TableCell>
        <TableCell className="money-cell">
          {e.direction === "IN" ? "+" : "−"}
          {cop(e.amount)}
        </TableCell>
        <TableCell>
          <RowActions
            name={e.reference || e.counterparty}
            actions={[
              ...(canLink(e)
                ? [{ label: "Completar datos", run: () => linkPayment(e) }]
                : []),
              ...(role === "ADMIN" && !e.reversed && e.kind !== "REVERSAL"
                ? [
                    e.kind === "SALARY_ADVANCE"
                      ? {
                          label: "Ver anticipos",
                          run: () =>
                            window.history.pushState(
                              null,
                              "",
                              "?view=Equipo&teamTab=advances",
                            ),
                        }
                      : {
                          label: "Revertir",
                          danger: true,
                          run: () => reverse(e),
                        },
                  ]
                : []),
            ]}
          />
        </TableCell>
      </TableRow>
    ));
  return (
    <div className="cash-feature">
      {!fixedTab && (
        <FinancialOverview
          period={period}
          setPeriod={setPeriod}
          role={role}
          compact
        />
      )}
      {tab === "entries" &&
        role === "ADMIN" &&
        !demo &&
        cash.entries.some(
          (e) =>
            !e.paymentId &&
            !e.reversed &&
            ["CUSTOMER_PAYMENT", "CUSTOMER_ADVANCE"].includes(e.kind),
        ) && (
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => setReviewLegacy((value) => !value)}
          >
            {reviewLegacy
              ? "Cerrar revisión de cobros antiguos"
              : "Revisar cobros antiguos sin cliente"}
          </Button>
        )}
      <Tabs
        value={
          ["obligations", "entries", "accounts"].includes(tab)
            ? tab
            : "obligations"
        }
        onValueChange={(value) => {
          setTab(value);
          setStatus("ALL");
          setQ("");
        }}
      >
        <div className="cash-tabs-header">
          {!fixedTab && (
            <TabsList aria-label="Registros de caja">
              <TabsTrigger value="obligations">Gastos por pagar</TabsTrigger>
              <TabsTrigger value="entries">Movimientos</TabsTrigger>
              <TabsTrigger value="accounts">Cuentas</TabsTrigger>
            </TabsList>
          )}
          <div className="row-actions flex-wrap">
            {!demo && role === "ADMIN" && (
              <Button
                variant="outline"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.set(
                    "table",
                    tab === "entries"
                      ? "cashEntries"
                      : tab === "accounts"
                        ? "accounts"
                        : "obligations",
                  );
                  if (tab === "obligations") params.set("period", period);
                  window.open(`/api/export?${params}`, "_blank", "noopener");
                }}
              >
                Exportar
              </Button>
            )}
            {!demo && tab === "entries" && (
              <Button
                variant="outline"
                onClick={() => {
                  window.history.pushState(
                    {},
                    "",
                    "/?view=Caja&moneyTab=receivables",
                  );
                }}
              >
                Ver deudas y cobrar
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setDialog(transferForm)}
              disabled={cash.accounts.length < 2 || mutation.isPending}
            >
              <ArrowLeftRight />
              Transferir
            </Button>
            {(tab !== "accounts" ||
              (role === "ADMIN" &&
                accountNames.some(
                  (name) => !cash.accounts.some((a) => a.name === name),
                ))) && (
              <Button
                onClick={() =>
                  setDialog(
                    tab === "accounts"
                      ? accountForm
                      : tab === "obligations"
                        ? obligationForm
                        : cashForm,
                  )
                }
                disabled={!cash.accounts.length && tab === "entries"}
              >
                <Plus data-icon="inline-start" />
                {tab === "accounts"
                  ? "Crear cuenta"
                  : tab === "obligations"
                    ? "Registrar gasto"
                    : "Registrar movimiento"}
              </Button>
            )}
          </div>
        </div>
        <FilterBar>
          <label className="search-filter">
            Buscar
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                tab === "obligations"
                  ? "Concepto del gasto"
                  : "Beneficiario, cuenta o comprobante"
              }
            />
          </label>
          {tab !== "accounts" && (
            <label>
              Estado / movimiento
              <Choice
                value={status}
                onChange={setStatus}
                options={[
                  { id: "ALL", label: "Todos" },
                  ...(tab === "obligations"
                    ? Object.entries(stateLabels).map(([id, label]) => ({
                        id,
                        label,
                      }))
                    : [
                        { id: "IN", label: "Entradas" },
                        { id: "OUT", label: "Salidas" },
                        { id: "TRANSFERS", label: "Transferencias" },
                      ]),
                ]}
              />
            </label>
          )}
          {!demo && tab === "entries" && (
            <label className="range-filter">
              Fecha del movimiento
              <DateRangePicker
                from={from}
                to={to}
                onChange={(a, b) => {
                  setFrom(a);
                  setTo(b);
                }}
              />
            </label>
          )}
          {!demo && tab === "entries" && (
            <>
              <label>
                Valor mínimo COP
                <Input
                  inputMode="decimal"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  placeholder="Desde"
                />
              </label>
              <label>
                Valor máximo COP
                <Input
                  inputMode="decimal"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  placeholder="Hasta"
                />
              </label>
            </>
          )}
          <ClearFilters
            active={!!(q || from || to || min || max || status !== "ALL")}
            onClear={() => {
              setQ("");
              setStatus("ALL");
              setFrom("");
              setTo("");
              setMin("");
              setMax("");
            }}
          />
        </FilterBar>
        <TabsContent value="obligations">
          <DataTable
            tableKey="obligations"
            headers={[
              "Concepto / vencimiento",
              "Estado",
              "Total COP",
              "Pagado COP",
              "Pendiente COP",
              "Acciones",
            ]}
            empty="No hay gastos registrados para este mes con estos filtros."
            renderRow={(row) => {
              const o = row as OperationsView["obligations"][number];
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <strong>
                      {o.title}
                      {o.estimated ? " · Estimado" : ""}
                    </strong>
                    <small className="cell-detail">
                      {dateLabel(o.dueOn)} ·{" "}
                      {
                        obligationCategories[
                          o.category as keyof typeof obligationCategories
                        ]
                      }
                    </small>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      data-payment-state={paymentState(o)}
                    >
                      {stateLabels[paymentState(o)]}
                    </Badge>
                  </TableCell>
                  <TableCell>{cop(o.amount)}</TableCell>
                  <TableCell>{cop(o.paid)}</TableCell>
                  <TableCell>
                    <strong>
                      {cop(new Decimal(o.amount).minus(o.paid).toString())}
                    </strong>
                  </TableCell>
                  <TableCell>
                    <RowActions
                      name={o.title}
                      actions={[
                        { label: "Revisar importe", run: () => correct(o) },
                        ...(new Decimal(o.amount).gt(o.paid)
                          ? [
                              {
                                label: "Pagar",
                                disabled:
                                  !cash.accounts.length || mutation.isPending,
                                run: () => pay(o),
                              },
                            ]
                          : []),
                        { label: "Ver pagos", run: () => setHistory(o.id) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            }}
            renderMobileRow={(row) => {
              const o = row as OperationsView["obligations"][number];
              return (
                <li key={o.id} className="mobile-cash-row">
                  <header>
                    <strong>
                      {o.title}
                      {o.estimated ? " · Estimado" : ""}
                    </strong>
                    <Badge
                      variant="secondary"
                      data-payment-state={paymentState(o)}
                    >
                      {stateLabels[paymentState(o)]}
                    </Badge>
                  </header>
                  <small>Vence {dateLabel(o.dueOn)}</small>
                  <dl>
                    <div>
                      <dt>Total</dt>
                      <dd>{cop(o.amount)}</dd>
                    </div>
                    <div>
                      <dt>Pagado</dt>
                      <dd>{cop(o.paid)}</dd>
                    </div>
                    <div>
                      <dt>Pendiente</dt>
                      <dd>
                        {cop(new Decimal(o.amount).minus(o.paid).toString())}
                      </dd>
                    </div>
                  </dl>
                  <footer>
                    <RowActions
                      name={o.title}
                      actions={[
                        { label: "Revisar importe", run: () => correct(o) },
                        { label: "Ver pagos", run: () => setHistory(o.id) },
                        ...(new Decimal(o.amount).gt(o.paid)
                          ? [
                              {
                                label: "Pagar",
                                disabled:
                                  !cash.accounts.length || mutation.isPending,
                                run: () => pay(o),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </footer>
                  {!cash.accounts.length &&
                    new Decimal(o.amount).gt(o.paid) && (
                      <p>
                        Registra una cuenta en la pestaña Cuentas para pagar.
                      </p>
                    )}
                </li>
              );
            }}
            fallbackRows={obligations}
          ></DataTable>
        </TabsContent>
        <TabsContent value="entries">
          <DataTable
            tableKey="cashEntries"
            headers={[
              "Fecha / cuenta",
              "Beneficiario / soporte",
              "Movimiento",
              "Valor COP",
              "Acciones",
            ]}
            renderMobileRow={(r) =>
              mobileEntries([r as (typeof entries)[number]])[0]
            }
            renderRow={(r) => entryRows([r as (typeof entries)[number]])[0]}
            fallbackRows={entries}
            empty="No hay movimientos con estos filtros."
          ></DataTable>
        </TabsContent>
        <TabsContent value="accounts">
          <DataTable
            tableKey="accounts"
            headers={["Cuenta", "Saldo actual COP"]}
            empty="No hay cuentas registradas."
            renderRow={(row) => {
              const a = row as OperationsView["accounts"][number];
              return (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>
                    <strong>{cop(a.balance)}</strong>
                  </TableCell>
                </TableRow>
              );
            }}
            fallbackRows={cash.accounts.filter((a) => matches(a.name, q))}
          ></DataTable>
        </TabsContent>
      </Tabs>
      <Sheet
        open={!!history}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      >
        <SheetContent className="payment-history-sheet">
          <SheetHeader>
            <SheetTitle>
              Pagos de {cash.obligations.find((o) => o.id === history)?.title}
            </SheetTitle>
            <SheetDescription>
              Abonos y reversiones de esta obligación.
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <DataTable
              tableKey="cashEntries"
              headers={[
                "Fecha / cuenta",
                "Beneficiario / soporte",
                "Movimiento",
                "Valor COP",
                "Acciones",
              ]}
              mobileRows={mobileEntries(
                cash.entries.filter((e) => e.obligationId === history),
              )}
              empty="Esta obligación aún no tiene pagos."
            >
              {entryRows(
                cash.entries.filter((e) => e.obligationId === history),
              )}
            </DataTable>
          </div>
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
            <SheetDescription>{dialog?.description}</SheetDescription>
          </SheetHeader>
          {dialog && (
            <OperationForm
              key={
                dialog.kind + dialog.title + String(dialog.extra?.entryId ?? "")
              }
              dialog={dialog}
              submit={async (input) => {
                if (dialog.kind === "obligation-correct")
                  await control.mutateAsync({
                    kind: "obligation-correct",
                    input,
                  });
                else if (dialog.kind === "link-payment")
                  await commerce.mutateAsync({ kind: "payment", input });
                else await mutation.mutateAsync({ kind: dialog.kind, input });
                setDialog(null);
                toast.success(
                  dialog.kind === "obligation"
                    ? "Gasto registrado."
                    : dialog.kind === "account"
                      ? "Cuenta creada."
                      : dialog.kind === "cash-reversal"
                        ? "Movimiento revertido."
                        : "Movimiento registrado.",
                );
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </div>
  );
}
