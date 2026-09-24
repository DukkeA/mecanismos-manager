"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useCommercialPage, useCommercialCommand } from "./hooks";
import { useWorkshopQuery } from "@/features/workshop/query";
import { DocumentEditor } from "./document-editor";
import { FormSheet } from "@/components/form-sheet";
import { OperationForm } from "@/components/operation-form";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { cop, todayInBogota } from "@/features/cash/summary";
import type { OrderView } from "@/domain/workshop-view";

export function OrderAgreement({ order }: { order: OrderView }) {
  const quotes = useCommercialPage(
    new URLSearchParams({ resource: "quotes", orderId: order.id }),
  );
  const sales = useCommercialPage(
    new URLSearchParams({
      resource: "sales",
      orderId: order.id,
      status: "ISSUED",
    }),
  );
  const snapshot = useWorkshopQuery();
  const command = useCommercialCommand();
  const [editing, setEditing] = useState<
    "quote" | "sale" | "decision" | "advance" | null
  >(null);
  const quote = quotes.data?.rows[0],
    sale = sales.data?.rows[0];
  const ready = ["READY", "CLOSED"].includes(order.status);
  if (!order.customerId || order.status === "CANCELLED") return null;
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h3 className="font-semibold">Precio acordado y cobro</h3>
      {quotes.isError || sales.isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo consultar el acuerdo.</AlertTitle>
          <Button
            variant="outline"
            onClick={() => {
              quotes.refetch();
              sales.refetch();
            }}
          >
            Reintentar
          </Button>
        </Alert>
      ) : quotes.isPending || sales.isPending ? (
        <p role="status">Consultando cotización y venta…</p>
      ) : (
        <>
          <ol
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
            aria-label="Pasos del trabajo"
          >
            <li className={quote ? "font-medium" : "text-muted-foreground"}>
              1. Cotizar {quote ? "✓" : ""}
            </li>
            <li
              className={
                quote?.status === "APPROVED"
                  ? "font-medium"
                  : "text-muted-foreground"
              }
            >
              2. Aprobar {quote?.status === "APPROVED" ? "✓" : ""}
            </li>
            <li className={ready ? "font-medium" : "text-muted-foreground"}>
              3. Terminar {ready ? "✓" : ""}
            </li>
            <li
              className={
                sale && Number(sale.balance) === 0
                  ? "font-medium"
                  : "text-muted-foreground"
              }
            >
              4. Cobrar {sale && Number(sale.balance) === 0 ? "✓" : ""}
            </li>
          </ol>
          {quote && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge
                  variant={
                    quote.status === "APPROVED" ? "default" : "secondary"
                  }
                >
                  COT-{quote.number} ·{" "}
                  {quote.status === "APPROVED"
                    ? "Aprobada"
                    : quote.status === "REJECTED"
                      ? "No aprobada"
                      : "Por aprobar"}
                </Badge>
                <strong>{cop(quote.total)}</strong>
              </div>
              {quote.approvedBy && (
                <p className="text-sm text-muted-foreground">
                  Aprobó {quote.approvedBy}. {quote.approvalNote}
                </p>
              )}
              {quote.lines?.map((line) => (
                <div
                  key={line.id}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span>
                    {line.quantity} {line.kind === "SERVICE" ? "h" : "×"}{" "}
                    {line.description}
                    {line.assignedMember ? ` · ${line.assignedMember}` : ""}
                  </span>
                  <span className="tabular-nums">{cop(line.total)}</span>
                </div>
              ))}
            </>
          )}
          {sale ? (
            <>
              <p className="flex justify-between gap-3 border-t pt-3">
                <span>
                  {Number(sale.balance) > 0
                    ? "Queda por cobrar"
                    : "Venta pagada"}
                </span>
                <strong>{cop(sale.balance)}</strong>
              </p>
              <Button
                asChild
                variant={Number(sale.balance) > 0 ? "default" : "outline"}
              >
                <a href={`?view=Ventas&recordId=${sale.id}`}>
                  {Number(sale.balance) > 0
                    ? "Ver venta y cobrar"
                    : "Ver venta y pagos"}
                </a>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing("advance")}>
                Recibir anticipo
              </Button>
              {!quote && (
                <Button onClick={() => setEditing("quote")}>
                  Cotizar este trabajo
                </Button>
              )}
              {quote?.status === "DRAFT" && (
                <Button onClick={() => setEditing("decision")}>
                  Registrar respuesta del cliente
                </Button>
              )}
              {quote && (
                <Button variant="outline" onClick={() => setEditing("quote")}>
                  Revisar precio o alcance
                </Button>
              )}
              {quote?.status === "APPROVED" &&
                (ready ? (
                  <Button onClick={() => setEditing("sale")}>
                    Registrar venta y cobro
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Precio aprobado. Continúa con las tareas y marca el trabajo
                    como listo cuando termine.
                  </p>
                ))}
              {quote?.status === "REJECTED" && (
                <p className="text-sm text-muted-foreground">
                  El cliente no aprobó esta cotización. Puedes ajustar el
                  alcance y enviar una nueva versión.
                </p>
              )}
            </>
          )}
        </>
      )}
      <FormSheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {editing === "quote"
                ? "Cotizar trabajo"
                : editing === "decision"
                  ? "Respuesta del cliente"
                  : editing === "advance"
                    ? "Recibir anticipo"
                    : "Venta y cobro"}
            </SheetTitle>
            <SheetDescription>
              OT-{order.number} · {order.customer}
            </SheetDescription>
          </SheetHeader>
          {editing === "advance" && snapshot.data && (
            <OperationForm
              dialog={{
                kind: "payment",
                title: "Recibir anticipo",
                submitLabel: "Guardar anticipo",
                extra: {
                  customerId: order.customerId,
                  occurredOn: todayInBogota(),
                  note: `Anticipo para OT-${order.number}`,
                },
                fields: [
                  {
                    key: "accountId",
                    label: "Cuenta que recibe el dinero",
                    type: "select",
                    options: snapshot.data.operations.accounts.map(
                      (account) => ({ id: account.id, label: account.name }),
                    ),
                  },
                  {
                    key: "amount",
                    label: "Valor del anticipo (COP)",
                    type: "money",
                  },
                  { key: "occurredOn", label: "Fecha", type: "date" },
                  {
                    key: "note",
                    label: "Observación",
                    type: "textarea",
                    hint: "Queda como saldo a favor del cliente. Podrás usarlo al registrar la venta.",
                  },
                ],
              }}
              submit={async (input) => {
                await command.mutateAsync({ kind: "payment", input });
                setEditing(null);
                toast.success("Anticipo guardado.");
              }}
            />
          )}
          {editing === "decision" && quote && (
            <OperationForm
              dialog={{
                kind: "quote-decision",
                title: "Respuesta del cliente",
                submitLabel: "Guardar respuesta",
                extra: { quoteId: quote.id },
                fields: [
                  {
                    key: "decision",
                    label: "Respuesta",
                    type: "select",
                    options: [
                      {
                        id: "APPROVED",
                        label: "Aprueba el precio y el trabajo",
                      },
                      { id: "REJECTED", label: "No aprueba" },
                    ],
                  },
                  { key: "approvedBy", label: "Nombre de quien responde" },
                  {
                    key: "note",
                    label: "Cómo confirmó y qué se acordó",
                    type: "textarea",
                  },
                ],
              }}
              submit={async (input) => {
                await command.mutateAsync({ kind: "quote-decision", input });
                setEditing(null);
                toast.success("Respuesta guardada.");
              }}
            />
          )}
          {(editing === "quote" || editing === "sale") && snapshot.data && (
            <DocumentEditor
              key={`${editing}-${quote?.id ?? "new"}`}
              mode={editing}
              source={quote}
              context={{
                customerId: order.customerId,
                orderId: order.id,
                title: order.title,
              }}
              data={snapshot.data.operations}
              orders={snapshot.data.orders}
              locations={snapshot.data.locations}
              onSaved={() => {
                setEditing(null);
                toast.success(
                  editing === "quote"
                    ? "Cotización guardada."
                    : "Venta guardada.",
                );
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </section>
  );
}
