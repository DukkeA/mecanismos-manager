import { db } from "@/server/db";
export async function cleanupActivity(ids: string[]) {
  const changes = await db().recordChange.findMany({
    where: { actorId: { in: ids } },
    select: { batchId: true },
  });
  await db().adminNotification.deleteMany({
    where: { batchId: { in: changes.map((c) => c.batchId) } },
  });
  await db().recordChange.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
}
