import "server-only";
import { db } from "./db";
import type { Actor } from "./commands";
import { emptyOperations, type OperationsView } from "@/domain/operations-view";
import Decimal from "decimal.js";

export async function getOperations(
  actor: Actor,
  selection?: { table: string; ids: string[] },
): Promise<OperationsView> {
  const subset = (table: string) =>
    selection
      ? { id: { in: selection.table === table ? selection.ids : [] } }
      : {};
  const members = await db().member.findMany({
    where: {
      ...subset("members"),
      ...(actor.role !== "MECHANIC" ? {} : { active: true }),
    },
    select:
      actor.role !== "MECHANIC"
        ? { id: true, name: true, email: true, role: true, active: true }
        : { id: true, name: true, active: true },
    orderBy: { name: "asc" },
  });
  const tasks = await db().task.findMany({
    where: {
      ...subset("tasks"),
      ...(actor.role === "MECHANIC"
        ? { deletedAt: null, assignments: { some: { memberId: actor.id } } }
        : actor.role === "ADMIN"
          ? {}
          : { deletedAt: null }),
    },
    select: {
      id: true,
      title: true,
      photos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, caption: true, createdAt: true, actorId: true },
      },
      description: true,
      plannedMinutes: true,
      version: true,
      deletedAt: true,
      notes: { orderBy: { createdAt: "desc" } },
      timeEntries: {
        orderBy: { createdAt: "desc" },
        include: { member: { select: { name: true } } },
      },
      orderId: true,
      status: true,
      createdAt: true,
      dueAt: true,
      assignments: { select: { memberId: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const history = await db().auditEvent.findMany({
    where: {
      entityId: { in: tasks.map((t) => t.id) },
      action: { startsWith: "TASK_" },
    },
    orderBy: { createdAt: "desc" },
  });
  const overtime = await db().overtimeEntry.findMany({
    where: {
      taskId: { in: tasks.map((t) => t.id) },
      voidedAt: null,
      kind: { not: "FIXED" },
    },
    select: {
      id: true,
      memberId: true,
      taskId: true,
      minutes: true,
      workedOn: true,
      note: true,
    },
  });
  const actorIds = [
    ...new Set([
      ...history.map((h) => h.actorId),
      ...overtime.map((e) => e.memberId),
      ...tasks.flatMap((t) => [
        ...t.notes.map((n) => n.actorId),
        ...t.photos.map((p) => p.actorId),
      ]),
    ]),
  ];
  const authors = await db().member.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const author = (id: string) =>
    authors.find((a) => a.id === id)?.name ?? "Miembro del equipo";
  const technical = {
    ...emptyOperations,
    members,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      photos: t.photos.map((p) => ({
        id: p.id,
        caption: p.caption,
        createdAt: p.createdAt.toISOString(),
        author: author(p.actorId),
      })),
      description: t.description,
      plannedMinutes: t.plannedMinutes,
      version: t.version,
      deletedAt: t.deletedAt?.toISOString(),
      notes: t.notes.map((n) => ({
        id: n.id,
        body: n.body,
        author: author(n.actorId),
        createdAt: n.createdAt.toISOString(),
      })),
      history: history
        .filter((h) => h.entityId === t.id)
        .map((h) => ({
          id: h.id,
          action: h.action,
          author: author(h.actorId),
          createdAt: h.createdAt.toISOString(),
          details: h.details as Record<string, unknown>,
        })),
      timeEntries: [
        ...t.timeEntries.map((e) => ({
          id: e.id,
          minutes: e.minutes,
          workedOn: e.workedOn.toISOString(),
          note: e.note,
          author: e.member.name,
        })),
        ...overtime
          .filter((e) => e.taskId === t.id)
          .map((e) => ({
            id: e.id,
            minutes: e.minutes,
            workedOn: e.workedOn.toISOString(),
            note: e.note,
            author: author(e.memberId),
            overtime: true,
          })),
      ],
      orderId: t.orderId,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      dueAt: t.dueAt?.toISOString(),
      members: t.assignments.map((a) => a.memberId),
    })),
  };
  const archivedTasks = technical.tasks.filter((t) => t.deletedAt);
  technical.tasks = technical.tasks.filter((t) => !t.deletedAt);
  if (actor.role === "MECHANIC") return technical;
  const [customers, items, suppliers, offers, balances, movements] =
    await Promise.all([
      db().customer.findMany({
        where: subset("customers"),
        orderBy: { name: "asc" },
        include: { _count: { select: { orders: true } } },
      }),
      db().catalogItem.findMany({
        where: subset("items"),
        orderBy: { name: "asc" },
      }),
      db().supplier.findMany({
        where: subset("suppliers"),
        orderBy: { name: "asc" },
      }),
      db().supplierOffer.findMany({
        where: subset("offers"),
        orderBy: { observedAt: "desc" },
      }),
      db().stockBalance.findMany({
        where: selection
          ? {
              OR:
                selection.table === "balances"
                  ? selection.ids.map((id) => ({
                      itemId: id.slice(0, 36),
                      locationId: id.slice(37, 73),
                      condition: id.slice(74) as "NEW" | "USED" | "REBUILT",
                    }))
                  : [],
            }
          : undefined,
      }),
      db().stockMovement.findMany({
        where: subset("movements"),
        orderBy: { createdAt: "desc" },
      }),
    ]);
  const reversed = await db().stockMovement.findMany({
    where: { reversalOfId: { in: movements.map((m) => m.id) } },
    select: { reversalOfId: true },
  });
  const [accounts, obligations, cash] = await Promise.all([
    db().moneyAccount.findMany({
      where: subset("accounts"),
      select: { id: true, name: true, balance: true },
      orderBy: { name: "asc" },
    }),
    db().obligation.findMany({
      where: {
        ...subset("obligations"),
      },
      include: { entries: { select: { amount: true, direction: true } } },
      orderBy: { dueOn: "desc" },
    }),
    db().cashEntry.findMany({
      where: {
        ...subset("cashEntries"),
      },
      orderBy: { createdAt: "desc" },
      include: {
        reversal: { select: { id: true } },
        customerPayment: { select: { id: true } },
      },
    }),
  ]);
  return {
    ...technical,
    coverage: !selection
      ? await db().monthCoverage.findMany({
          select: { period: true, confirmed: true },
        })
      : [],
    archivedTasks,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: a.balance.toFixed(2),
    })),
    obligations: obligations.map((o) => ({
      salaryPeriod: o.salaryPeriod,
      estimated: o.estimated,
      id: o.id,
      title: o.title,
      category: o.category,
      period: o.period,
      amount: o.amount.toFixed(2),
      paid: o.entries
        .reduce(
          (sum, e) =>
            sum.plus(
              e.direction === "OUT"
                ? e.amount.toString()
                : new Decimal(e.amount.toString()).negated(),
            ),
          new Decimal(0),
        )
        .toFixed(2),
      dueOn: o.dueOn.toISOString().slice(0, 10),
    })),
    cashEntries: cash.map((e) => ({
      transferId: e.transferId,
      id: e.id,
      accountId: e.accountId,
      obligationId: e.obligationId,
      amount: e.amount.toFixed(2),
      direction: e.direction,
      kind: e.kind,
      counterparty: e.counterparty,
      reference: e.reference,
      note: e.note,
      occurredOn: e.occurredOn.toISOString().slice(0, 10),
      reversed: !!e.reversal,
      paymentId: e.customerPayment?.id,
    })),
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      document: c.document ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      orders: c._count.orders,
      deletedAt: c.deletedAt?.toISOString(),
    })),
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      brand: i.brand ?? "",
      kind: i.kind,
      unit: i.unit,
      reference: i.reference,
      notes: i.notes,
    })),
    suppliers: suppliers.map((s) => ({
      email: s.email ?? "",
      address: s.address ?? "",
      deletedAt: s.deletedAt?.toISOString(),
      id: s.id,
      name: s.name,
      phone: s.phone ?? "",
    })),
    offers: offers.map((o) => ({
      id: o.id,
      itemId: o.itemId,
      supplierId: o.supplierId,
      condition: o.condition,
      unitCost: o.unitCost.toFixed(2),
      reportedStock: o.reportedStock ?? "",
      observedAt: o.observedAt.toISOString().slice(0, 10),
      evidence: o.evidence,
    })),
    balances: balances.map((b) => ({
      costKnown: b.costKnown,
      itemId: b.itemId,
      locationId: b.locationId,
      condition: b.condition,
      quantity: b.quantity.toString(),
      reserved: b.reserved.toString(),
      materialCost: b.materialCost.toFixed(2),
    })),
    movements: movements.map((m) => ({
      id: m.id,
      itemId: m.itemId,
      locationId: m.locationId,
      condition: m.condition,
      quantity: m.quantity.toString(),
      materialAmount: m.materialAmount.toFixed(2),
      kind: m.kind,
      reason: m.reason,
      date: m.createdAt.toISOString(),
      reversed: reversed.some((r) => r.reversalOfId === m.id),
    })),
  };
}
