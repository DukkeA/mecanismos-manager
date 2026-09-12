"use client";
import { useSearchParams } from "next/navigation";
import type { OperationsView } from "@/domain/operations-view";
import type { OrderView } from "@/domain/workshop-view";
import type { Role } from "@/domain/permissions";
import { CashPanel } from "./cash-panel";
import { FinancialOverview } from "./financial-overview";
import { CommercePanel } from "@/features/commerce/commerce-panel";
import { ControlPanel } from "@/features/control/control-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { todayInBogota } from "./summary";
import { useQueryState } from "@/components/workshop-controls";

const tabs = [
  ["overview", "Resumen"],
  ["receivables", "Por cobrar"],
  ["obligations", "Por pagar"],
  ["entries", "Movimientos"],
  ["accounts", "Cuentas"],
  ["review", "Revisión mensual"],
] as const;
export function MoneyWorkspace({
  section,
  ...props
}: {
  section: string;
  data: OperationsView;
  orders: OrderView[];
  locations: { id: string; name: string }[];
  role: Role;
}) {
  const params = useSearchParams();
  const legacy =
    section === "Cartera"
      ? "receivables"
      : section === "Control de caja"
        ? "review"
        : params.get("cashTab");
  const requested = params.get("moneyTab") ?? legacy ?? "overview";
  const tab = tabs.some(([id]) => id === requested) ? requested : "overview";
  const subtab = params.get("moneyDetail") ?? "pending";
  const [period, setPeriod] = useQueryState(
    "period",
    todayInBogota().slice(0, 7),
  );
  function change(value: string, detail?: string) {
    const next = new URLSearchParams({ view: "Caja", moneyTab: value, period });
    if (detail) next.set("moneyDetail", detail);
    window.history.pushState(null, "", `?${next}`);
  }
  return (
    <div className="workspace-tabs flex flex-col gap-5">
      <Tabs value={tab} onValueChange={(value) => change(value)}>
        <TabsList
          className="h-auto flex-wrap justify-start"
          aria-label="Dinero del taller"
        >
          {tabs.map(([id, label]) => (
            <TabsTrigger key={id} value={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "overview" && (
        <>
          <FinancialOverview
            role={props.role}
            period={period}
            setPeriod={setPeriod}
          />
        </>
      )}
      {tab === "receivables" && (
        <>
          <Tabs
            value={subtab === "receipts" ? "receipts" : "pending"}
            onValueChange={(value) => change(tab, value)}
          >
            <TabsList variant="line" aria-label="Cobros de clientes">
              <TabsTrigger value="pending">Deudas pendientes</TabsTrigger>
              <TabsTrigger value="receipts">Cobros y anticipos</TabsTrigger>
            </TabsList>
          </Tabs>
          <CommercePanel
            key={subtab}
            {...props}
            section={subtab === "receipts" ? "Cartera" : "Ventas"}
            receivables={subtab !== "receipts"}
          />
        </>
      )}
      {tab === "obligations" && (
        <>
          <Tabs
            value={subtab === "suppliers" ? "suppliers" : "expenses"}
            onValueChange={(value) => change(tab, value)}
          >
            <TabsList variant="line" aria-label="Pagos del taller">
              <TabsTrigger value="expenses">Gastos del mes</TabsTrigger>
              <TabsTrigger value="suppliers">Compras a proveedores</TabsTrigger>
            </TabsList>
          </Tabs>
          {subtab === "suppliers" ? (
            <ControlPanel {...props} resources={["purchases"]} payables />
          ) : (
            <CashPanel key={tab} role={props.role} fixedTab="obligations" />
          )}
        </>
      )}
      {(tab === "entries" || tab === "accounts") && (
        <CashPanel key={tab} role={props.role} fixedTab={tab} />
      )}
      {tab === "review" && (
        <>
          <p className="text-sm text-muted-foreground">
            Comprueba los saldos de las cuentas y los gastos que se repiten cada
            mes.
          </p>
          <ControlPanel
            {...props}
            resources={
              props.role === "ADMIN"
                ? ["closures", "recurring", "coverage", "audit"]
                : ["closures", "recurring"]
            }
          />
        </>
      )}
    </div>
  );
}
