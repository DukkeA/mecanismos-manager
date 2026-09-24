"use client";
import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { OperationsPanel } from "@/components/operations-panel";
import { ControlPanel } from "@/features/control/control-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HubResource } from "@/domain/hub";

export function InventoryWorkspace(
  props: ComponentProps<typeof OperationsPanel>,
) {
  const params = useSearchParams();
  const sections = [
    ["stock", "Repuestos"],
    ...(!props.demo
      ? [
          ["reservations", "Reservas"],
          ["transfers", "Traslados"],
          ...(props.role === "ADMIN" ? [["counts", "Conteos"]] : []),
          ["units", "Reconstruidos"],
        ]
      : []),
  ];
  const requested =
    props.section === "Control de inventario"
      ? (params.get("controlTab") ?? "reservations")
      : (params.get("inventoryTab") ?? "stock");
  const tab = sections.some(([id]) => id === requested) ? requested : "stock";
  return (
    <div className="flex flex-col gap-5">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const q = new URLSearchParams({
            view: "Inventario",
            inventoryTab: value,
          });
          if (value !== "stock") q.set("controlTab", value);
          window.history.pushState(null, "", `?${q}`);
        }}
      >
        <TabsList aria-label="Inventario">
          {sections.map(([id, label]) => (
            <TabsTrigger key={id} value={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "stock" ? (
        <OperationsPanel {...props} section="Inventario" />
      ) : (
        <ControlPanel key={tab} {...props} resources={[tab as HubResource]} />
      )}
    </div>
  );
}
