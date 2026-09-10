import { DomainError } from "@/domain/errors";
import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import { once, type Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";

const quantity=z.string().regex(/^\d{1,10}(\.\d{1,3})?$/).refine(v=>new Decimal(v).gt(0),"La cantidad debe ser positiva.");
const money=z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
export async function saveItem(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"inventory:write");
  const input=z.object({code:z.string().trim().min(1).max(80),name:z.string().trim().min(3).max(200),brand:z.string().trim().max(100),kind:z.enum(["PART","SERVICE"]),unit:z.string().trim().min(1).max(30)}).parse(raw);
  return db().$transaction(async tx=>{
    const item=await tx.catalogItem.create({data:input});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:item.id,action:"ITEM_CREATED",details:{code:item.code}}});
    return {id:item.id};
  });
}

export async function saveSupplier(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"inventory:write");
  const input=z.object({name:z.string().trim().min(2).max(180),phone:z.string().trim().max(40)}).parse(raw);
  return db().$transaction(async tx=>{
    const supplier=await tx.supplier.create({data:input});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:supplier.id,action:"SUPPLIER_CREATED",details:{name:supplier.name}}});
    return {id:supplier.id};
  });
}

export async function saveOffer(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"inventory:write");
  const input=z.object({itemId:z.uuid(),supplierId:z.uuid(),condition:z.enum(["NEW","USED","REBUILT"]),unitCost:money,reportedStock:z.string().trim().max(120),observedAt:z.iso.date(),evidence:z.string().trim().min(3).max(1000)}).parse(raw);
  return db().$transaction(async tx=>{
    const offer=await tx.supplierOffer.create({data:{...input,observedAt:new Date(input.observedAt+"T12:00:00Z")}});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:offer.id,action:"OFFER_RECORDED",details:{itemId:input.itemId,supplierId:input.supplierId}}});
    return {id:offer.id};
  });
}

export async function moveStock(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"inventory:write");
  const input=z.object({requestId:z.uuid(),itemId:z.uuid(),locationId:z.uuid(),condition:z.enum(["NEW","USED","REBUILT"]),quantity,unitCost:money.default("0"),kind:z.enum(["RECEIPT","CONSUMPTION","ADJUSTMENT_IN","ADJUSTMENT_OUT"]),orderId:z.uuid().optional(),reason:z.string().trim().min(3).max(1000)}).parse(raw);
  if(input.kind.startsWith("ADJUSTMENT")&&actor.role!=="ADMIN")throw new DomainError("Solo administración puede ajustar existencias.");
  if(input.kind==="CONSUMPTION"&&!input.orderId)throw new DomainError("El consumo requiere una orden.");
  return once(actor,input.requestId,"STOCK_MOVED",input,async tx=>{
    const item=await tx.catalogItem.findUniqueOrThrow({where:{id:input.itemId}});
    if(item.kind!=="PART"||item.serialized)throw new DomainError("Este movimiento solo admite repuestos de inventario por cantidad.");
    await tx.location.findUniqueOrThrow({where:{id:input.locationId}});
    if(input.orderId) {
      const order=await tx.workOrder.findUniqueOrThrow({where:{id:input.orderId}});
      if(["CLOSED","CANCELLED"].includes(order.status))throw new DomainError("No puedes consumir en una orden cerrada.");
    }
    const key={itemId:input.itemId,locationId:input.locationId,condition:input.condition};
    const balance=await tx.stockBalance.upsert({where:{itemId_locationId_condition:key},create:key,update:{}});
    const incoming=["RECEIPT","ADJUSTMENT_IN"].includes(input.kind);
    const qty=new Decimal(input.quantity);
    const currentQty=new Decimal(balance.quantity.toString());
    const value=new Decimal(balance.materialCost.toString());
    if(!incoming&&currentQty.minus(balance.reserved.toString()).lt(qty))throw new DomainError("No hay existencias disponibles suficientes.");
    const amount=incoming?qty.mul(input.unitCost).toDecimalPlaces(2):qty.eq(currentQty)?value:value.mul(qty).div(currentQty).toDecimalPlaces(2);
    const signedQty=incoming?qty:qty.negated();
    const signedValue=incoming?amount:amount.negated();
    const movement=await tx.stockMovement.create({data:{...key,quantity:signedQty.toString(),materialAmount:signedValue.toFixed(2),kind:input.kind,reason:input.reason,actorId:actor.id,orderId:input.orderId}});
    await tx.stockBalance.update({where:{itemId_locationId_condition:key},data:{quantity:currentQty.plus(signedQty).toString(),materialCost:value.plus(signedValue).toFixed(2)}});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:movement.id,action:"STOCK_MOVED",details:{itemId:item.id,quantity:signedQty.toString(),kind:input.kind}}});
    return {id:movement.id};
  });
}

export async function reverseMovement(actor:Actor,raw:unknown) {
  requirePermission(actor.role,"members:write");
  const input=z.object({requestId:z.uuid(),movementId:z.uuid(),reason:z.string().trim().min(5).max(1000)}).parse(raw);
  return once(actor,input.requestId,"STOCK_REVERSED",input,async tx=>{
    const original=await tx.stockMovement.findUniqueOrThrow({where:{id:input.movementId}});
    if(original.reversalOfId||await tx.stockMovement.findUnique({where:{reversalOfId:original.id}}))throw new DomainError("Ese movimiento ya fue revertido o es una reversión.");
    if(original.orderId) {
      const order=await tx.workOrder.findUniqueOrThrow({where:{id:original.orderId}});
      if(["CLOSED","CANCELLED"].includes(order.status))throw new DomainError("La orden está cerrada; requiere un ajuste de período revisado.");
    }
    const key={itemId:original.itemId,locationId:original.locationId,condition:original.condition};
    const balance=await tx.stockBalance.findUniqueOrThrow({where:{itemId_locationId_condition:key}});
    const nextQty=new Decimal(balance.quantity.toString()).minus(original.quantity.toString());
    const nextValue=new Decimal(balance.materialCost.toString()).minus(original.materialAmount.toString());
    if(nextQty.lt(balance.reserved.toString())||nextValue.lt(0)||(nextQty.eq(0)&&!nextValue.eq(0)))throw new DomainError("No es posible revertir después de los movimientos posteriores. Revisa un ajuste.");
    const movement=await tx.stockMovement.create({data:{...key,quantity:new Decimal(original.quantity.toString()).negated().toString(),materialAmount:new Decimal(original.materialAmount.toString()).negated().toString(),kind:"REVERSAL",reason:input.reason,actorId:actor.id,orderId:original.orderId,reversalOfId:original.id}});
    await tx.stockBalance.update({where:{itemId_locationId_condition:key},data:{quantity:nextQty.toString(),materialCost:nextValue.toFixed(2)}});
    await tx.auditEvent.create({data:{actorId:actor.id,entityId:movement.id,action:"STOCK_REVERSED",details:{originalId:original.id}}});
    return {id:movement.id};
  });
}
