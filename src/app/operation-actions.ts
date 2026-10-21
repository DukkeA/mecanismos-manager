"use server";
import { transferCash } from "@/server/cash-transfers";
import { createQuickPurchase } from "@/server/quick-purchase-service";
import { zodFieldErrors } from "@/domain/form-validation";
import { AccessDenied } from "@/domain/permissions";
import { deleteContact } from "@/server/contact-service";
import { editTask, archiveTask, addTaskNote } from "@/server/task-service";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/server/auth";
import {
  saveCustomer,
  saveMember,
  setOrderCoordinator,
  assignTask,
  changeTaskStatus,
  transitionOrder,
} from "@/server/operations-service";
import {
  saveItem,
  saveSupplier,
  saveOffer,
  moveStock,
  reverseMovement,
} from "@/server/inventory-service";
import { DomainError } from "@/domain/errors";
import { ZodError } from "zod";
import {
  createAccount,
  createObligation,
  recordCash,
  reverseCash,
} from "@/server/cash-service";

export async function executeOperation(
  kind: string,
  input: unknown,
): Promise<
  | { ok: true; id?: string }
  | { ok: false; error: string; fields?: Record<string, string> }
> {
  try {
    const actor = await requireMember();
    switch (kind) {
      case "quick-purchase":
        await createQuickPurchase(actor, input);
        break;
      case "account":
        await createAccount(actor, input);
        break;
      case "obligation":
        await createObligation(actor, input);
        break;
      case "cash-transfer":
        await transferCash(actor, input);
        break;
      case "cash":
        await recordCash(actor, input);
        break;
      case "cash-reversal":
        await reverseCash(actor, input);
        break;
      case "customer-delete":
        await deleteContact(actor, "customer", input);
        break;
      case "supplier-delete":
        await deleteContact(actor, "supplier", input);
        break;
      case "customer": {
        const result = await saveCustomer(actor, input);
        revalidatePath("/");
        return { ok: true, id: result.id };
      }
      case "member":
        await saveMember(actor, input);
        break;
      case "task":
        await assignTask(actor, input);
        break;
      case "task-edit":
        await editTask(actor, input);
        break;
      case "task-archive":
        await archiveTask(actor, input);
        break;
      case "task-note":
        await addTaskNote(actor, input);
        break;
      case "task-status":
        await changeTaskStatus(actor, input);
        break;
      case "order-status":
        await transitionOrder(actor, input);
        break;
      case "order-coordinator":
        await setOrderCoordinator(actor, input);
        break;
      case "item":
        await saveItem(actor, input);
        break;
      case "supplier":
        await saveSupplier(actor, input);
        break;
      case "offer":
        await saveOffer(actor, input);
        break;
      case "stock":
        await moveStock(actor, input);
        break;
      case "stock-reversal":
        await reverseMovement(actor, input);
        break;
      default:
        throw new Error("Operación no disponible.");
    }
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    if (error instanceof ZodError)
      return {
        ok: false,
        error: "Revisa los campos señalados.",
        fields: zodFieldErrors(error),
      };
    // Database internals and connection strings must never be returned to the browser.
    if (error instanceof DomainError || error instanceof AccessDenied)
      return { ok: false, error: error.message };
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    )
      return {
        ok: false,
        error:
          "Ya existe un registro con ese código o correo. Revisa los datos.",
        ...(kind === "item"
          ? {
              fields: {
                code: "Este código ya existe. Usa otro o edita el repuesto existente.",
              },
            }
          : {}),
      };
    return {
      ok: false,
      error:
        "No se pudo guardar. Comprueba permisos, referencias y conexión; tus campos se conservan.",
    };
  }
}
