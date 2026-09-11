"use server";
import { requireMember } from "@/server/auth";
import {
  createPurchase,
  receivePurchase,
  returnPurchase,
  paySupplier,
  closePurchase,
} from "@/server/purchase-service";
import {
  reserveStock,
  finishReservation,
  transferStock,
  previewCount,
  applyCount,
} from "@/server/stock-workflows";
import {
  saveLaborRate,
  openWarranty,
  reviewWarranty,
  recordCheck,
  handoverOrder,
  changeOwner,
  registerUnit,
  finishUnit,
  sellUnit,
} from "@/server/job-service";
import {
  closeCash,
  reopenCash,
  saveRecurring,
  generateMonth,
  confirmMonth,
  correctObligation,
} from "@/server/financial-control";
import { DomainError } from "@/domain/errors";
import { AccessDenied } from "@/domain/permissions";
import { ZodError } from "zod";
const commands = {
  purchase: createPurchase,
  "purchase-receive": receivePurchase,
  "purchase-return": returnPurchase,
  "supplier-pay": paySupplier,
  "purchase-close": closePurchase,
  reserve: reserveStock,
  "reservation-finish": finishReservation,
  "stock-transfer": transferStock,
  "count-preview": previewCount,
  "count-apply": applyCount,
  "labor-rate": saveLaborRate,
  warranty: openWarranty,
  "warranty-review": reviewWarranty,
  check: recordCheck,
  handover: handoverOrder,
  "asset-owner": changeOwner,
  unit: registerUnit,
  "unit-finish": finishUnit,
  "unit-sell": sellUnit,
  "cash-close": closeCash,
  "cash-reopen": reopenCash,
  recurring: saveRecurring,
  "month-generate": generateMonth,
  "month-confirm": confirmMonth,
  "obligation-correct": correctObligation,
};
export async function controlCommand(
  kind: keyof typeof commands,
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const actor = await requireMember();
    if (!Object.hasOwn(commands, kind))
      throw new DomainError("Operación no disponible.");
    const result = await commands[kind](actor, input);
    return { ok: true, id: String(result.id) };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof DomainError || e instanceof AccessDenied
          ? e.message
          : e instanceof ZodError
            ? (e.issues[0]?.message ?? "Revisa los campos.")
            : "No se pudo guardar. Revisa los datos y vuelve a intentarlo.",
    };
  }
}
