import "server-only";
import { z } from "zod";
import {
  organizerInput,
  assertOrganizerAccess,
  type OrganizerItem,
} from "@/domain/organizer";
import { DomainError } from "@/domain/errors";
import { once, serializable, setActor, type Actor } from "./commands";
import { Prisma } from "@/generated/prisma/client";
import { notePlainText } from "@/domain/note-content";
import { persistNoteImages } from "./note-images";

export async function listOrganizer(actor: Actor) {
  assertOrganizerAccess(actor);
  return serializable(async (tx) => {
    await setActor(tx, actor);
    const rows = await tx.organizerEntry.findMany({
      where: {
        deletedAt: null,
        OR: [{ visibility: "GENERAL" }, { ownerId: actor.id }],
      },
      include: {
        owner: { select: { name: true } },
        updatedBy: { select: { name: true } },
      },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
    return rows.map(
      ({
        owner,
        updatedBy,
        createdAt: _created,
        deletedAt: _deleted,
        updatedById: _editor,
        ...r
      }) => ({
        ...r,
        author: owner.name,
        updatedBy: updatedBy.name,
        updatedAt: r.updatedAt.toISOString(),
        startsAt: r.startsAt?.toISOString() ?? null,
        endsAt: r.endsAt?.toISOString() ?? null,
      }),
    ) as OrganizerItem[];
  });
}
export async function saveOrganizer(actor: Actor, raw: unknown) {
  assertOrganizerAccess(actor);
  const input = organizerInput.parse(raw);
  return once(actor, input.requestId, "ORGANIZER_SAVED", input, async (tx) => {
    const previous = input.id
      ? await tx.organizerEntry.findFirst({
          where: { id: input.id, deletedAt: null },
        })
      : null;
    if (input.id && !previous)
      throw new DomainError("El registro no está disponible.");
    assertOrganizerAccess(actor, previous ?? undefined);
    if (
      previous &&
      (previous.version !== input.version ||
        previous.kind !== input.kind ||
        previous.visibility !== input.visibility)
    )
      throw new DomainError(
        "El registro cambió. Vuelve a abrirlo antes de guardar.",
      );
    if (
      input.orderId &&
      !(await tx.workOrder.findUnique({ where: { id: input.orderId } }))
    )
      throw new DomainError("La orden no existe.");
    const { requestId: _request, id, version: _version, ...values } = input;
    const data = {
      ...values,
      richContent:
        input.richContent === undefined
          ? undefined
          : input.richContent === null
            ? Prisma.DbNull
            : (input.richContent as Prisma.InputJsonObject),
      body: input.richContent ? notePlainText(input.richContent) : input.body,
      calendar: input.kind === "EVENT" || input.calendar,
      completed: input.kind === "TODO" && input.completed,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      updatedById: actor.id,
      updatedAt: new Date(),
    };
    const result = id
      ? await tx.organizerEntry.update({
          where: { id, version: input.version },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.organizerEntry.create({
          data: { ...data, ownerId: actor.id },
        });
    if (input.richContent) {
      const content = await persistNoteImages(
        tx,
        actor,
        result.id,
        input.richContent,
      );
      await tx.organizerEntry.update({
        where: { id: result.id },
        data: { richContent: content as Prisma.InputJsonObject },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: result.id,
        action: "ORGANIZER_SAVED",
        details: {
          kind: result.kind,
          visibility: result.visibility,
          version: result.version,
        },
      },
    });
    return { id: result.id };
  });
}
export async function deleteOrganizer(actor: Actor, raw: unknown) {
  assertOrganizerAccess(actor);
  const input = z
    .object({
      requestId: z.uuid(),
      id: z.uuid(),
      version: z.number().int().nonnegative(),
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "ORGANIZER_DELETED",
    input,
    async (tx) => {
      const row = await tx.organizerEntry.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!row) throw new DomainError("El registro no está disponible.");
      assertOrganizerAccess(actor, row, true);
      if (row.version !== input.version)
        throw new DomainError("El registro cambió. Vuelve a abrirlo.");
      await tx.organizerEntry.update({
        where: { id: row.id, version: input.version },
        data: {
          deletedAt: new Date(),
          updatedAt: new Date(),
          updatedById: actor.id,
          version: { increment: 1 },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: row.id,
          action: "ORGANIZER_DELETED",
          details: { kind: row.kind },
        },
      });
      return { id: row.id };
    },
  );
}
