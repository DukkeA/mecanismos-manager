import "server-only";
import { z } from "zod";
import { db } from "./db";
import { type Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { entityLabels } from "@/domain/activity";

export async function activityQuery(actor: Actor, params: URLSearchParams) {
  requirePermission(actor.role, "finance:write");
  const p = z
    .object({
      resource: z.enum(["latest", "history", "notifications", "batch"]),
      id: z.uuid().optional(),
      batchId: z.string().regex(/^\d+$/).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(Object.fromEntries(params));
  if (p.resource === "latest") {
    const rows = await db().$queryRaw<
      { entityId: string; id: string; author: string; at: Date }[]
    >`
      SELECT DISTINCT ON (v."entityId") v."entityId",v.id,v."actorName" author,v."createdAt" at FROM (
       SELECT "entityId",id,"actorName","createdAt" FROM workshop."RecordChange"
       UNION ALL SELECT (after->>'memberId')::uuid,id,"actorName","createdAt" FROM workshop."RecordChange" WHERE after->>'memberId' IS NOT NULL
       UNION ALL SELECT (after->>'reversalOfId')::uuid,id,"actorName","createdAt" FROM workshop."RecordChange" WHERE after->>'reversalOfId' IS NOT NULL
       UNION ALL SELECT (after->>'advanceId')::uuid,id,"actorName","createdAt" FROM workshop."RecordChange" WHERE after->>'advanceId' IS NOT NULL
      )v ORDER BY v."entityId",v."createdAt" DESC,v.id DESC`;
    return Object.fromEntries(
      rows.map((r) => [
        r.entityId,
        { id: r.id, author: r.author, at: r.at.toISOString() },
      ]),
    );
  }
  if (p.resource === "notifications") {
    requirePermission(actor.role, "members:write");
    const where = { recipientId: actor.id };
    const [unread, total, items] = await Promise.all([
      db().adminNotification.count({ where: { ...where, readAt: null } }),
      db().adminNotification.count({ where }),
      db().adminNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (p.page - 1) * 20,
        take: 20,
      }),
    ]);
    const changes = await db().recordChange.findMany({
      where: { batchId: { in: items.map((n) => n.batchId) } },
      orderBy: { createdAt: "asc" },
    });
    const names = await db().member.findMany({
      select: { id: true, name: true },
    });
    return {
      unread,
      total,
      rows: items.map((n) => {
        const batch = changes.filter((c) => c.batchId === n.batchId);
        const first =
          batch.find(
            (c) =>
              !["MoneyAccount", "CashEntry", "AdvanceInstallment"].includes(
                c.entityType,
              ),
          ) ?? batch[0];
        const data = first?.after as Record<string, unknown> | undefined;
        const subject =
          data?.name ??
          data?.title ??
          data?.counterparty ??
          names.find((m) => m.id === data?.memberId)?.name;
        return {
          id: n.id,
          batchId: n.batchId,
          readAt: n.readAt?.toISOString() ?? null,
          at: n.createdAt.toISOString(),
          author: first?.actorName ?? "Oficina",
          title: `${entityLabels[first?.entityType ?? ""] ?? "Registro"}${subject ? ` · ${subject}` : ""}`,
          count: batch.length,
        };
      }),
    };
  }
  if (p.resource === "batch") {
    requirePermission(actor.role, "members:write");
    z.string().min(1).parse(p.batchId);
    await db().adminNotification.findUniqueOrThrow({
      where: {
        recipientId_batchId: { recipientId: actor.id, batchId: p.batchId! },
      },
    });
  } else z.uuid().parse(p.id);
  const rows = await db().recordChange.findMany({
    where:
      p.resource === "batch"
        ? { batchId: p.batchId }
        : {
            OR: [
              { entityId: p.id },
              { after: { path: ["memberId"], equals: p.id } },
              { after: { path: ["advanceId"], equals: p.id } },
              { after: { path: ["reversalOfId"], equals: p.id } },
            ],
          },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (p.page - 1) * 50,
    take: 50,
  });
  const names = await db().member.findMany({
    select: { id: true, name: true },
  });
  return rows.map((r) => ({
    subject: String(
      (r.after as Record<string, unknown>).name ??
        (r.after as Record<string, unknown>).title ??
        (r.after as Record<string, unknown>).counterparty ??
        names.find(
          (m) => m.id === (r.after as Record<string, unknown>).memberId,
        )?.name ??
        "",
    ),
    id: r.id,
    entityId: r.entityId,
    entityType: r.entityType,
    operation: r.operation,
    before: r.before,
    after: r.after,
    author: r.actorName,
    at: r.createdAt.toISOString(),
  }));
}

export async function readNotification(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const p = z.object({ ids: z.array(z.uuid()).min(1).max(100) }).parse(raw);
  await db().adminNotification.updateMany({
    where: { id: { in: p.ids }, recipientId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { id: p.ids[0] };
}
