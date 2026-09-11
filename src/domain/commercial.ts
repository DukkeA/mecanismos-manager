import { z } from "zod";
import Decimal from "decimal.js";

export const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Escribe un importe válido.");
export const positiveMoney = money.refine(
  (v) => new Decimal(v).gt(0),
  "El importe debe ser mayor que cero.",
);
export const quantity = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,3})?$/)
  .refine((v) => new Decimal(v).gt(0));
export const documentLine = z.object({
  itemId: z.uuid(),
  description: z.string().trim().min(2).max(250),
  quantity,
  unitPrice: money,
  discount: money.default("0"),
  estimatedUnitCost: money.optional(),
  condition: z.enum(["NEW", "USED", "REBUILT"]).default("NEW"),
});
export const documentInput = z.object({
  requestId: z.uuid(),
  customerId: z.uuid(),
  orderId: z.uuid().optional(),
  title: z.string().trim().min(3).max(250),
  terms: z.string().trim().max(5000).default(""),
  lines: z.array(documentLine).min(1).max(60),
});
export type DocumentLineInput = z.infer<typeof documentLine>;
export function lineTotal(
  line: Pick<DocumentLineInput, "quantity" | "unitPrice" | "discount">,
) {
  const gross = new Decimal(line.quantity)
    .mul(line.unitPrice)
    .toDecimalPlaces(2);
  if (gross.lt(line.discount))
    throw new Error("El descuento supera el valor de la línea.");
  return gross.minus(line.discount).toFixed(2);
}

export type CommercialLine = {
  id: string;
  itemId: string;
  description: string;
  reference: string;
  kind: "PART" | "SERVICE";
  condition: "NEW" | "USED" | "REBUILT";
  quantity: string;
  unitPrice: string;
  discount: string;
  total: string;
  returnedQuantity?: string;
  estimatedUnitCost?: string | null;
};
export type CommercialRow = {
  id: string;
  number?: number;
  title: string;
  customerId: string;
  customer: string;
  status: string;
  total: string;
  paid: string;
  balance: string;
  createdAt: string;
  date: string;
  dueOn?: string;
  orderId?: string | null;
  orderNumber?: number | null;
  saleId?: string | null;
  revision?: number;
  groupId?: string;
  terms?: string;
  approvedBy?: string | null;
  approvalNote?: string | null;
  invoiceReference?: string;
  lines?: CommercialLine[];
  entryId?: string;
  available?: string;
  allocations?: {
    id: string;
    saleId: string;
    saleNumber: number;
    amount: string;
    reversed: boolean;
  }[];
};
export type CommercialPage = {
  rows: CommercialRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { receivable: string; advances: string; sales: string };
};
