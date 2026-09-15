import "server-only";
import { db } from "./db";
import type { Role } from "@/domain/permissions";
import type { OrderView } from "@/domain/workshop-view";

export async function getOrders(
  actor: { id: string; role: Role },
  ids?: string[],
): Promise<OrderView[]> {
  const orders = await db().workOrder.findMany({
    where: {
      ...(ids ? { id: { in: ids } } : {}),
      ...(actor.role === "MECHANIC"
        ? {
            OR: [
              { responsibleId: actor.id },
              {
                tasks: {
                  some: {
                    deletedAt: null,
                    assignments: { some: { memberId: actor.id } },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      responsibleId: true,
      responsible: { select: { name: true } },
      number: true,
      businessCategoryId: true,
      sales: { where: { status: "ISSUED" }, select: { id: true }, take: 1 },
      businessCategory: { select: { name: true } },
      title: true,
      reportedProblem: true,
      status: true,
      purpose: true,
      version: true,
      receivedAt: true,
      dueAt: true,
      closedAt: true,
      customer: { select: { name: true, id: true } },
      location: { select: { name: true } },
      assets: {
        select: {
          asset: {
            select: {
              kind: true,
              plate: true,
              serial: true,
              description: true,
            },
          },
        },
      },
      tasks: {
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          plannedMinutes: true,
          assignments: {
            select: { memberId: true, member: { select: { name: true } } },
          },
          timeEntries: { select: { minutes: true } },
        },
      },
      observations: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          body: true,
          createdAt: true,
          member: { select: { name: true } },
        },
      },
    },
  });
  const overtime = await db().overtimeEntry.groupBy({
    by: ["taskId"],
    where: {
      taskId: { in: orders.flatMap((o) => o.tasks.map((t) => t.id)) },
      voidedAt: null,
      kind: { not: "FIXED" },
    },
    _sum: { minutes: true },
  });
  const extraMinutes = new Map(
    overtime.map((e) => [e.taskId, e._sum.minutes ?? 0]),
  );
  return orders.map((order) => {
    const asset = order.assets[0]?.asset;
    return {
      id: order.id,
      number: order.number,
      businessCategoryId: order.businessCategoryId,
      businessCategoryLocked:
        order.sales.length > 0 ||
        ["CLOSED", "CANCELLED"].includes(order.status),
      businessCategory: order.businessCategory?.name ?? "Sin categoría",
      title: order.title,
      reference: asset?.plate ?? asset?.serial ?? "Sin referencia",
      kind: asset?.kind ?? "COMPONENT",
      family:
        order.purpose === "OWN_REBUILD"
          ? "Unidad propia"
          : asset?.description && asset.description !== order.title
            ? asset.description
            : asset?.kind === "VEHICLE"
              ? "Vehículo"
              : "Componente suelto",
      status: order.status,
      responsibleId: order.responsibleId,
      responsible:
        order.responsible?.name ??
        ([
          ...new Set(
            order.tasks.flatMap((t) => t.assignments.map((a) => a.member.name)),
          ),
        ].join(", ") ||
          "Sin asignar"),
      nextStep:
        order.tasks.find((t) => t.status !== "DONE")?.title ??
        (order.status === "CLOSED"
          ? "Trabajo entregado"
          : order.status === "CANCELLED"
            ? "Trabajo cancelado"
            : order.status === "READY"
              ? "Coordinar entrega"
              : order.status === "QUALITY_REVIEW"
                ? "Revisar resultados de pruebas"
                : "Asignar tarea"),
      customerId: order.customer?.id,
      customer: order.customer?.name ?? "Mecanismos · unidad propia",
      problem: order.reportedProblem,
      location: order.location.name,
      version: order.version,
      receivedAt: order.receivedAt.toISOString(),
      dueAt: order.dueAt?.toISOString(),
      closedAt: order.closedAt?.toISOString(),
      tasks: order.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        done: t.status === "DONE",
        status: t.status,
        plannedMinutes: t.plannedMinutes,
        minutes:
          t.timeEntries.reduce((s, e) => s + e.minutes, 0) +
          (extraMinutes.get(t.id) ?? 0),
        memberIds: t.assignments.map((a) => a.memberId),
      })),
      notes: order.observations.map((o) => ({
        id: o.id,
        body: o.body,
        author: o.member.name,
        createdAt: o.createdAt.toISOString(),
        date: o.createdAt.toLocaleString("es-CO", {
          timeZone: "America/Bogota",
        }),
      })),
    };
  });
}
