"use client";
import type { ComponentProps } from "react";
import { CommercePanel } from "./commerce-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CommerceWorkspace(props: ComponentProps<typeof CommercePanel>) {
  const tab = props.section === "Cotizaciones" ? "quotes" : "sales";
  return (
    <div className="workspace-tabs flex flex-col gap-5">
      <Tabs
        value={tab}
        onValueChange={(value) =>
          window.history.pushState(
            null,
            "",
            `?view=${value === "quotes" ? "Cotizaciones" : "Ventas"}`,
          )
        }
      >
        <TabsList aria-label="Ventas y cotizaciones">
          <TabsTrigger value="sales">Ventas</TabsTrigger>
          <TabsTrigger value="quotes">Cotizaciones</TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="text-sm text-muted-foreground">
        {tab === "quotes"
          ? "Acuerda el precio con el cliente. Al aprobarlo, puedes recibir el trabajo o hacer una venta de mostrador."
          : "Registra lo que se vende y cobra en el mismo paso. Los abonos y las deudas quedan en Dinero → Por cobrar."}
      </p>
      <CommercePanel key={tab} {...props} />
    </div>
  );
}
