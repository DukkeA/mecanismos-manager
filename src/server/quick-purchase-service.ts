import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import {
  quickPurchaseInput,
  type QuickPurchaseRow,
} from "@/domain/quick-purchase";
import { requirePermission } from "@/domain/permissions";
import { once, type Actor } from "./commands";
import { day, postMoney } from "./commercial-ledger";
import { db } from "./db";
import { Prisma } from "@/generated/prisma/client";

export async function createQuickPurchase(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = quickPurchaseInput.parse(raw);
  return once(
    actor,
    input.requestId,
    "QUICK_PURCHASE_CREATED",
    input,
    async (tx) => {
      const expense = await tx.obligation.create({
        data: {
          title: input.title,
          amount: input.amount,
          category: "OTHER",
          period: input.occurredOn.slice(0, 7),
          dueOn: day(input.dueOn),
          purchaseDetails: {
            supplier: input.supplier,
            note: input.note,
            occurredOn: input.occurredOn,
          },
        },
      });
      if (input.accountId)
        await postMoney(tx, actor, {
          accountId: input.accountId,
          obligationId: expense.id,
          amount: input.amount,
          direction: "OUT",
          kind: "EXPENSE_PAYMENT",
          occurredOn: input.occurredOn,
          counterparty: input.supplier || input.title,
          note: input.note || input.title,
        });
      await tx.monthCoverage.updateMany({
        where: { period: expense.period },
        data: { confirmed: false },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: expense.id,
          action: "QUICK_PURCHASE_CREATED",
          details: input,
        },
      });
      return { id: expense.id };
    },
  );
}

export async function quickPurchases(actor: Actor, params: URLSearchParams) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      q: z.string().trim().max(200).default(""),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .parse(Object.fromEntries(params));
  const where = {
    purchaseDetails: {
      not: Prisma.DbNull,
    },
    title: { contains: input.q, mode: "insensitive" as const },
  };
  const total = await db().obligation.count({ where });
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 10)));
  const expenses = await db().obligation.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * 10,
    take: 10,
    include: { entries: true },
  });
  const rows: QuickPurchaseRow[] = expenses.map((expense) => {
    const details = expense.purchaseDetails as {
      supplier: string;
      note: string;
      occurredOn: string;
    };
    const paid = expense.entries.reduce(
      (s, e) =>
        s.plus(
          e.direction === "OUT"
            ? e.amount.toString()
            : new Decimal(e.amount.toString()).negated(),
        ),
      new Decimal(0),
    );
    return {
      id: expense.id,
      title: expense.title,
      ...details,
      dueOn: expense.dueOn.toISOString().slice(0, 10),
      amount: expense.amount.toString(),
      paid: paid.toString(),
      pending: new Decimal(expense.amount.toString()).minus(paid).toString(),
    };
  });
  return { rows, total, page };
}
