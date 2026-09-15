"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
export function OrderWorkspaceTabs({
  section,
  navigate,
}: {
  section: string;
  navigate: (section: string) => void;
}) {
  return (
    <Tabs value={section} onValueChange={navigate} className="mb-5">
      <TabsList aria-label="Tipo de orden">
        <TabsTrigger value="Órdenes">Reparaciones</TabsTrigger>
        <TabsTrigger value="Ventas">Ventas</TabsTrigger>
        <TabsTrigger value="Cotizaciones">Cotizaciones</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
