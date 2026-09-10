"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/server/auth";
import { saveCustomer,saveMember,assignTask,changeTaskStatus,transitionOrder } from "@/server/operations-service";
import { saveItem,saveSupplier,saveOffer,moveStock,reverseMovement } from "@/server/inventory-service";
import { DomainError } from "@/domain/errors";
import { ZodError } from "zod";
import { createAccount,createObligation,recordCash,reverseCash } from "@/server/cash-service";

export async function executeOperation(kind:string,input:unknown):Promise<{ok:true}|{ok:false;error:string;fields?:Record<string,string>}> {
  try {
    const actor=await requireMember();
    switch(kind) {
      case "account":await createAccount(actor,input);break;
      case "obligation":await createObligation(actor,input);break;
      case "cash":await recordCash(actor,input);break;
      case "cash-reversal":await reverseCash(actor,input);break;
      case "customer":await saveCustomer(actor,input);break;
      case "member":await saveMember(actor,input);break;
      case "task":await assignTask(actor,input);break;
      case "task-status":await changeTaskStatus(actor,input);break;
      case "order-status":await transitionOrder(actor,input);break;
      case "item":await saveItem(actor,input);break;
      case "supplier":await saveSupplier(actor,input);break;
      case "offer":await saveOffer(actor,input);break;
      case "stock":await moveStock(actor,input);break;
      case "stock-reversal":await reverseMovement(actor,input);break;
      default:throw new Error("Operación no disponible.");
    }
    revalidatePath("/");return {ok:true};
  }catch(error) {
    if(error instanceof ZodError)return {ok:false,error:"Revisa los campos señalados.",fields:Object.fromEntries(error.issues.filter(i=>i.path.length).map(i=>[String(i.path[0]),i.code==="too_small"?"El valor está vacío o es demasiado corto.":i.code==="too_big"?"El valor supera el tamaño permitido.":"Revisa el formato o selecciona una opción válida."]))};
    // Database internals and connection strings must never be returned to the browser.
    if(error instanceof DomainError)return {ok:false,error:error.message};
    return {ok:false,error:"No se pudo guardar. Comprueba permisos, referencias y conexión; tus campos se conservan."};
  }
}
