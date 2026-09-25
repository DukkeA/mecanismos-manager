"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OperationForm } from "@/components/operation-form";
import { useCashMutation } from "./hooks";
import { todayInBogota } from "./summary";

export function OrderExpense({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const mutation = useCashMutation();
  return (
    <section className="space-y-3">
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "Cerrar gasto" : "Añadir gasto de este trabajo"}
      </Button>
      {open && (
        <>
          <p className="text-sm text-muted-foreground">
            Por ejemplo, un trabajo externo o transporte. Quedará en Dinero →
            Por pagar. Los repuestos de inventario se registran en Compras y
            Consumos.
          </p>
          <OperationForm
            dialog={{
              kind: "obligation",
              title: "Gasto del trabajo",
              submitLabel: "Guardar gasto",
              extra: {
                orderId,
                category: "OTHER",
                period: todayInBogota().slice(0, 7),
                dueOn: todayInBogota(),
              },
              fields: [
                { key: "title", label: "En qué se gastó" },
                { key: "amount", label: "Valor COP", type: "money" },
                { key: "period", label: "Mes del gasto", hint: "AAAA-MM" },
                { key: "dueOn", label: "Fecha de pago acordada", type: "date" },
              ],
            }}
            submit={async (input) => {
              await mutation.mutateAsync({ kind: "obligation", input });
              setOpen(false);
              toast.success(
                "Gasto vinculado al trabajo. Puedes registrar su pago en Dinero.",
              );
            }}
          />
        </>
      )}
    </section>
  );
}
