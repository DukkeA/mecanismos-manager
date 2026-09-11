import { assertOpenCash } from "./financial-control";
import { reverseTransfer } from "./cash-transfers";
import { releaseAllocations } from "./commercial-ledger";
import { DomainError } from "@/domain/errors";
import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once,type Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { accountNames } from "@/domain/accounts";
import { cashKinds } from "@/domain/cash";

const money=z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const positiveMoney=money.refine(v=>new Decimal(v).gt(0));
export async function createAccount(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"members:write");
  const input=z.object({requestId:z.uuid(),name:z.enum(accountNames),openingBalance:money}).parse(raw);
  return once(actor,input.requestId,"ACCOUNT_CREATED",input,async tx=>{
    if(await tx.moneyAccount.findUnique({where:{name:input.name}})) throw new DomainError("Esta cuenta ya existe.");
    const account=await tx.moneyAccount.create({data:{name:input.name,openingBalance:input.openingBalance,balance:input.openingBalance}});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:account.id,action:"ACCOUNT_CREATED",details:{openingBalance:input.openingBalance}}});
    return {id:account.id};
  });
}
export async function createObligation(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"finance:write");
  const input=z.object({requestId:z.uuid(),title:z.string().trim().min(3).max(200),category:z.enum(["RENT","UTILITIES","PAYROLL","OTHER"]),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),amount:positiveMoney,dueOn:z.iso.date()}).parse(raw);
  if(input.category==="PAYROLL")requirePermission(actor.role,"payroll:read");
  return once(actor,input.requestId,"OBLIGATION_CREATED",input,async tx=>{
    await tx.monthCoverage.updateMany({where:{period:input.period},data:{confirmed:false}});
    const obligation=await tx.obligation.create({data:{title:input.title,category:input.category,period:input.period,amount:input.amount,dueOn:new Date(input.dueOn+"T00:00:00Z")}});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:obligation.id,action:"OBLIGATION_CREATED",details:{category:input.category,period:input.period}}});
    return {id:obligation.id};
  });
}

export async function recordCash(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"finance:write");
  const input=z.object({requestId:z.uuid(),accountId:z.uuid(),obligationId:z.uuid().optional(),kind:z.enum(Object.keys(cashKinds) as [keyof typeof cashKinds,...(keyof typeof cashKinds)[]]),amount:positiveMoney,counterparty:z.string().trim().min(2).max(200),reference:z.string().trim().max(200),note:z.string().trim().min(3).max(1000),occurredOn:z.iso.date()}).parse(raw);
  if(["OWNER_WITHDRAWAL","OWNER_CONTRIBUTION","LOAN_RECEIVED","LOAN_PAYMENT"].includes(input.kind)&&actor.role!=="ADMIN")throw new DomainError("Esta operación requiere administración.");
  return once(actor,input.requestId,"CASH_RECORDED",input,async tx=>{
    await assertOpenCash(tx,input.accountId,input.occurredOn);
    const direction=cashKinds[input.kind].direction;const amount=new Decimal(input.amount);
    const account=await tx.moneyAccount.findUniqueOrThrow({where:{id:input.accountId}});
    if(input.obligationId){
      if(input.kind!=="EXPENSE_PAYMENT")throw new DomainError("Solo los pagos de gasto pueden abonar una obligación.");
      const obligation=await tx.obligation.findUniqueOrThrow({where:{id:input.obligationId},include:{entries:true}});
      if(obligation.category==="PAYROLL")requirePermission(actor.role,"payroll:read");
      const paid=obligation.entries.reduce((sum,e)=>sum.plus(e.direction==="OUT"?e.amount.toString():new Decimal(e.amount.toString()).negated()),new Decimal(0));
      if(paid.plus(amount).gt(obligation.amount.toString()))throw new DomainError("El pago supera el saldo pendiente de la obligación.");
    }
    const balance=new Decimal(account.balance.toString()).plus(direction==="IN"?amount:amount.negated());
    if(balance.lt(0))throw new DomainError("La cuenta no tiene saldo suficiente. Revisa entradas y saldo inicial.");
    const entry=await tx.cashEntry.create({data:{accountId:input.accountId,obligationId:input.obligationId,kind:input.kind,direction,amount:input.amount,counterparty:input.counterparty,reference:input.reference,note:input.note,occurredOn:new Date(input.occurredOn+"T00:00:00Z"),actorId:actor.id}});
    await tx.moneyAccount.update({where:{id:account.id},data:{balance:balance.toFixed(2)}});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:entry.id,action:"CASH_RECORDED",details:{kind:input.kind,accountId:account.id}}});
    return {id:entry.id};
  });
}

export async function reverseCash(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"members:write");
  const input=z.object({requestId:z.uuid(),entryId:z.uuid(),reason:z.string().trim().min(5).max(1000),occurredOn:z.iso.date()}).parse(raw);
  return once(actor,input.requestId,"CASH_REVERSED",input,async tx=>{
    const original=await tx.cashEntry.findUniqueOrThrow({where:{id:input.entryId}});
    if(original.reversalOfId||await tx.cashEntry.findUnique({where:{reversalOfId:original.id}}))throw new DomainError("Ese movimiento no admite otra reversión.");
    await assertOpenCash(tx,original.accountId,input.occurredOn);
    if(original.transferId) return reverseTransfer(tx,actor,original.transferId,input);
    const payment = await tx.customerPayment.findUnique({where:{entryId:original.id},include:{refunds:{include:{entry:{include:{reversal:true}}}}}});
    if(payment?.refunds.some(r=>!r.entry.reversal))throw new DomainError("Revierte las devoluciones de este anticipo antes de revertir su cobro.");
    if(payment)await releaseAllocations(tx,actor,{paymentId:payment.id},input.reason);
    const account=await tx.moneyAccount.findUniqueOrThrow({where:{id:original.accountId}});
    const direction=original.direction==="IN"?"OUT":"IN";
    const next=new Decimal(account.balance.toString()).plus(direction==="IN"?original.amount.toString():new Decimal(original.amount.toString()).negated());
    if(next.lt(0))throw new DomainError("No hay saldo para revertir esta entrada.");
    const entry=await tx.cashEntry.create({data:{accountId:account.id,obligationId:original.obligationId,direction,amount:original.amount,kind:"REVERSAL",counterparty:original.counterparty,reference:original.reference,note:input.reason,occurredOn:new Date(input.occurredOn+"T00:00:00Z"),actorId:actor.id,reversalOfId:original.id}});
    await tx.moneyAccount.update({where:{id:account.id},data:{balance:next.toFixed(2)}});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:entry.id,action:"CASH_REVERSED",details:{originalId:original.id}}});
    return {id:entry.id};
  });
}
