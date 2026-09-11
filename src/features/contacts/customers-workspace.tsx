"use client";
import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { OperationsPanel } from "@/components/operations-panel";
import { ControlPanel } from "@/features/control/control-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CustomersWorkspace(
  props: ComponentProps<typeof OperationsPanel>,
) {
  const params = useSearchParams();
  const tab =
    !props.demo &&
    (props.section === "Activos" || params.get("customerTab") === "assets")
      ? "assets"
      : "contacts";
  return (
    <div className="workspace-tabs flex flex-col gap-5">
      {!props.demo && (
        <Tabs
          value={tab}
          onValueChange={(value) =>
            window.history.pushState(
              null,
              "",
              `?view=Clientes&customerTab=${value}`,
            )
          }
        >
          <TabsList aria-label="Clientes">
            <TabsTrigger value="contacts">Contactos</TabsTrigger>
            <TabsTrigger value="assets">Vehículos y componentes</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {tab === "contacts" ? (
        <OperationsPanel {...props} section="Clientes" />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Vehículos, bombas, inyectores y transmisiones recibidos para
            reparar. Consulta sus trabajos anteriores por placa o número de
            serie.
          </p>
          <ControlPanel {...props} resources={["assets"]} />
        </>
      )}
    </div>
  );
}
