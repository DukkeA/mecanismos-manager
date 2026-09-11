"use server";
import { requireMember } from "@/server/auth";
import { saveQuote, decideQuote } from "@/server/quote-service";
import { issueSale, returnSale, voidSale } from "@/server/sales-service";
import {
  receivePayment,
  applyPayment,
  unapplyPayment,
  refundPayment,
} from "@/server/payment-service";
import { reverseCash } from "@/server/cash-service";
import { DomainError } from "@/domain/errors";
import { AccessDenied } from "@/domain/permissions";
import { ZodError } from "zod";
const commands = {
  quote: saveQuote,
  "quote-decision": decideQuote,
  sale: issueSale,
  "sale-return": returnSale,
  "sale-void": voidSale,
  payment: receivePayment,
  "payment-apply": applyPayment,
  "payment-unapply": unapplyPayment,
  "payment-refund": refundPayment,
  "payment-reverse": reverseCash,
};
export async function commercialCommand(
  kind: keyof typeof commands,
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const actor = await requireMember();
    if (!Object.hasOwn(commands, kind))
      throw new DomainError("Operación no disponible.");
    const result = await commands[kind](actor, input);
    return { ok: true, id: String(result.id) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof DomainError || error instanceof AccessDenied
          ? error.message
          : error instanceof ZodError
            ? (error.issues[0]?.message ?? "Revisa los campos.")
            : "No se pudo guardar. Revisa los datos y vuelve a intentarlo.",
    };
  }
}
