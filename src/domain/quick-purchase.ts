import { z } from "zod";
import { positiveMoney } from "./commercial";

export const quickPurchaseInput = z
  .object({
    requestId: z.uuid(),
    title: z.string().trim().min(3, "Describe qué compraste.").max(200),
    supplier: z.string().trim().max(180).default(""),
    note: z.string().trim().max(2000).default(""),
    amount: positiveMoney,
    occurredOn: z.iso.date(),
    dueOn: z.iso.date(),
    accountId: z.preprocess(
      (v) => (v === "" || v === "__none" ? undefined : v),
      z.uuid().optional(),
    ),
  })
  .refine((v) => v.dueOn >= v.occurredOn, {
    path: ["dueOn"],
    message: "El vencimiento no puede ser anterior a la compra.",
  });

export type QuickPurchaseRow = {
  id: string;
  title: string;
  supplier: string;
  note: string;
  occurredOn: string;
  dueOn: string;
  amount: string;
  paid: string;
  pending: string;
};
