"use client";
import { useCommercialPage } from "./hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cop } from "@/features/cash/summary";
export function OrderAgreement({ orderId }: { orderId: string }) {
  const quotes = useCommercialPage(
      new URLSearchParams({ resource: "quotes", orderId, status: "APPROVED" }),
    ),
    sales = useCommercialPage(
      new URLSearchParams({ resource: "sales", orderId, status: "ISSUED" }),
    );
  const quote = quotes.data?.rows[0],
    sale = sales.data?.rows[0];
  return (
    <section className="border-t pt-4 flex flex-col gap-3">
      <h3 className="font-semibold">Acuerdo y saldo del cliente</h3>
      {quote ? (
        <>
          <p>
            <Badge variant="secondary">
              Cotización {quote.number} · versión {quote.revision}
            </Badge>
          </p>
          <p className="text-sm">
            Aprobó {quote.approvedBy}: {quote.approvalNote}
          </p>
          {quote.lines?.map((l) => (
            <div key={l.id} className="flex justify-between gap-3 text-sm">
              <span>
                {l.quantity} × {l.description}
              </span>
              <strong>{cop(l.total)}</strong>
            </div>
          ))}
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {quote.terms}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay una cotización aprobada registrada.
        </p>
      )}
      {sale ? (
        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div>
            <p className="text-sm text-muted-foreground">Venta neta</p>
            <strong>{cop(sale.total)}</strong>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Por cobrar</p>
            <strong>{cop(sale.balance)}</strong>
          </div>
          <Button asChild variant="outline" className="col-span-2">
            <a href={`?view=Ventas&q=${sale.number}`}>Ver venta y abonos</a>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          La venta aún no está registrada.
        </p>
      )}
    </section>
  );
}
