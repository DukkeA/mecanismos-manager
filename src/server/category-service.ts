import "server-only";
import { z } from "zod";
import { db } from "./db";
import { once, type Actor, type Tx } from "./commands";
import { DomainError } from "@/domain/errors";
import { requirePermission } from "@/domain/permissions";
import {
  catalogLabelError,
  catalogLabelKey,
  cleanCatalogLabel,
} from "@/domain/catalog-label";

const categoryName = z.string().transform((value) => {
  const error = catalogLabelError(value);
  if (error) throw new DomainError(error);
  return cleanCatalogLabel(value);
});

export async function createCategory(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({ requestId: z.uuid(), name: categoryName })
    .parse(raw);
  return once(actor, input.requestId, "CATEGORY_CREATED", input, async (tx) => {
    const existing = await tx.businessCategory.findUnique({
      where: { nameKey: catalogLabelKey(input.name) },
    });
    if (existing && !existing.active)
      throw new DomainError(
        `La categoría «${existing.name}» está desactivada. Administración puede reactivarla en Configuración.`,
      );
    if (existing)
      return {
        id: existing.id,
        name: existing.name,
        active: existing.active,
        version: existing.version,
        created: false,
      };
    const category = await tx.businessCategory.create({
      data: { name: input.name },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: category.id,
        action: "CATEGORY_CREATED",
        details: { name: category.name, active: true },
      },
    });
    return {
      id: category.id,
      name: category.name,
      active: category.active,
      version: category.version,
      created: true,
    };
  });
}

export async function assertCategory(
  tx: Tx,
  id?: string | null,
  previous?: string | null,
) {
  if (!id) return;
  const category = await tx.businessCategory.findUnique({ where: { id } });
  if (!category || (!category.active && id !== previous))
    throw new DomainError("Selecciona una categoría activa.");
}
export async function listCategories() {
  return db().businessCategory.findMany({ orderBy: { name: "asc" } });
}
export async function saveCategory(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({
      requestId: z.uuid(),
      id: z.uuid().optional(),
      version: z.number().int().nonnegative().optional(),
      name: categoryName,
      active: z.boolean(),
    })
    .parse(raw);
  return once(actor, input.requestId, "CATEGORY_SAVED", input, async (tx) => {
    const before = input.id
      ? await tx.businessCategory.findUniqueOrThrow({ where: { id: input.id } })
      : null;
    if (before && before.version !== input.version)
      throw new DomainError(
        "Esta categoría cambió. Recarga la lista antes de guardar.",
      );
    if (
      await tx.businessCategory.findFirst({
        where: {
          nameKey: catalogLabelKey(input.name),
          ...(input.id ? { id: { not: input.id } } : {}),
        },
      })
    )
      throw new DomainError("Ya existe una categoría con ese nombre.");
    const category = input.id
      ? await tx.businessCategory.update({
          where: { id: input.id },
          data: {
            name: input.name,
            active: input.active,
            version: { increment: 1 },
          },
        })
      : await tx.businessCategory.create({
          data: { name: input.name, active: input.active },
        });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: category.id,
        action: "CATEGORY_SAVED",
        details: {
          before: before ? { name: before.name, active: before.active } : null,
          name: category.name,
          active: category.active,
        },
      },
    });
    return { id: category.id };
  });
}
export async function assignOrderCategory(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = z
    .object({
      requestId: z.uuid(),
      orderId: z.uuid(),
      version: z.number().int().nonnegative(),
      businessCategoryId: z.uuid(),
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "ORDER_CATEGORY_CHANGED",
    input,
    async (tx) => {
      const order = await tx.workOrder.findUniqueOrThrow({
        where: { id: input.orderId },
      });
      if (order.version !== input.version)
        throw new DomainError(
          "La orden cambió. Recarga su detalle antes de guardar.",
        );
      if (
        ["CLOSED", "CANCELLED"].includes(order.status) ||
        (await tx.sale.findFirst({
          where: { orderId: order.id, status: "ISSUED" },
        }))
      )
        throw new DomainError(
          "La categoría queda fija al emitir la venta o cerrar la orden.",
        );
      await assertCategory(
        tx,
        input.businessCategoryId,
        order.businessCategoryId,
      );
      await tx.workOrder.update({
        where: { id: order.id },
        data: {
          businessCategoryId: input.businessCategoryId,
          version: { increment: 1 },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: order.id,
          action: "ORDER_CATEGORY_CHANGED",
          details: {
            before: order.businessCategoryId,
            businessCategoryId: input.businessCategoryId,
          },
        },
      });
      return { id: order.id };
    },
  );
}
