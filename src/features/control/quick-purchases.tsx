"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useOperationMutation,
  useWorkshopScope,
} from "@/features/workshop/query";
import {
  useQueryState,
  TablePagination,
  dateLabel,
} from "@/components/workshop-controls";
import { FormSheet } from "@/components/form-sheet";
import { OperationForm, type Dialog } from "@/components/operation-form";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cop, todayInBogota } from "@/features/cash/summary";
import type { QuickPurchaseRow } from "@/domain/quick-purchase";
import type { OperationsView } from "@/domain/operations-view";

export function QuickPurchases({ data }: { data: OperationsView }) {
  const { actorId, demo } = useWorkshopScope();
  const command = useOperationMutation("purchases");
  const [q, setQ] = useQueryState("q"),
    [page, setPage] = useQueryState("page", "1");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const params = new URLSearchParams({ q, page });
  const query = useQuery({
    queryKey: ["purchases", actorId, params.toString()],
    enabled: !demo,
    queryFn: async ({
      signal,
    }): Promise<{ rows: QuickPurchaseRow[]; total: number; page: number }> => {
      const response = await fetch(`/api/purchases?${params}`, {
        signal,
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      return body;
    },
  });
  const accounts = data.accounts.map((a) => ({ id: a.id, label: a.name }));
  return (
    <div className="flex flex-col gap-5">
      <div className="operations-heading">
        <p>
          Compras de uso diario: aceite, insumos y artículos de oficina. Se
          registran como gasto y no crean inventario.
        </p>
        <Button
          disabled={demo}
          onClick={() =>
            setDialog({
              kind: "quick-purchase",
              title: "Registrar compra rápida",
              submitLabel: "Guardar compra",
              extra: { occurredOn: todayInBogota(), dueOn: todayInBogota() },
              fields: [
                {
                  key: "title",
                  label: "¿Qué compraste?",
                  minLength: 3,
                  maxLength: 200,
                },
                {
                  key: "supplier",
                  label: "Proveedor o establecimiento",
                  optional: true,
                  maxLength: 180,
                },
                { key: "amount", label: "Valor total (COP)", type: "money" },
                { key: "occurredOn", label: "Fecha de compra", type: "date" },
                { key: "dueOn", label: "Fecha de pago acordada", type: "date" },
                {
                  key: "accountId",
                  label: "Cuenta de pago",
                  type: "select",
                  optional: true,
                  options: accounts,
                  hint: "Déjala sin asociar si queda pendiente. Selecciona una cuenta si ya pagaste el total.",
                },
                {
                  key: "note",
                  label: "Detalles",
                  type: "textarea",
                  optional: true,
                  maxLength: 2000,
                },
              ],
            })
          }
        >
          <Plus data-icon="inline-start" />
          Registrar compra
        </Button>
      </div>
      <label className="flex max-w-md flex-col gap-2">
        Buscar compra
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage("1");
          }}
          placeholder="Aceite, papelería…"
        />
      </label>
      {demo ? (
        <p>Las compras rápidas están disponibles al ingresar al taller.</p>
      ) : query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{query.error.message}</AlertTitle>
        </Alert>
      ) : (
        <div className="data-panel">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Compra",
                  "Fecha",
                  "Valor",
                  "Pagado",
                  "Pendiente",
                  "Estado",
                  "Acciones",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.rows.length ? (
                query.data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <strong>{row.title}</strong>
                      <p className="text-sm text-muted-foreground">
                        {row.supplier}
                      </p>
                      {row.note && (
                        <p className="max-w-80 whitespace-normal text-sm">
                          {row.note}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{dateLabel(row.occurredOn)}</TableCell>
                    <TableCell>{cop(row.amount)}</TableCell>
                    <TableCell>{cop(row.paid)}</TableCell>
                    <TableCell>{cop(row.pending)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          Number(row.pending) > 0 ? "outline" : "secondary"
                        }
                      >
                        {Number(row.pending) === 0
                          ? "Pagada"
                          : Number(row.paid) > 0
                            ? "Abono pendiente"
                            : "Por pagar"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {Number(row.pending) > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDialog({
                              kind: "cash",
                              title: `Pagar ${row.title}`,
                              extra: {
                                obligationId: row.id,
                                kind: "EXPENSE_PAYMENT",
                                counterparty: row.supplier || row.title,
                                amount: row.pending,
                                occurredOn: todayInBogota(),
                                reference: "",
                                note: `Pago de ${row.title}`,
                              },
                              fields: [
                                {
                                  key: "accountId",
                                  label: "Cuenta de pago",
                                  type: "select",
                                  options: accounts,
                                },
                                {
                                  key: "amount",
                                  label: "Valor del pago (COP)",
                                  type: "money",
                                },
                                {
                                  key: "occurredOn",
                                  label: "Fecha del pago",
                                  type: "date",
                                },
                                {
                                  key: "note",
                                  label: "Detalles",
                                  type: "textarea",
                                  optional: true,
                                },
                              ],
                            })
                          }
                        >
                          Registrar pago
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7}>
                    No hay compras para esta consulta.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            total={query.data.total}
            page={query.data.page}
            pageSize={10}
            onPageChange={(next) => setPage(String(next))}
          />
        </div>
      )}
      <FormSheet
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>{dialog?.title}</SheetTitle>
            <SheetDescription>
              El gasto y sus pagos se reflejan también en Dinero y rentabilidad.
            </SheetDescription>
          </SheetHeader>
          {dialog && (
            <OperationForm
              dialog={dialog}
              submit={async (input) => {
                await command.mutateAsync({ kind: dialog.kind, input });
                setDialog(null);
                toast.success("Compra actualizada.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </div>
  );
}
