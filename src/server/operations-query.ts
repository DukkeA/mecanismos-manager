import "server-only";
import { db } from "./db";
import type { Actor } from "./commands";
import { emptyOperations, type OperationsView } from "@/domain/operations-view";
import Decimal from "decimal.js";

export async function getOperations(actor:Actor):Promise<OperationsView> {
  const members=await db().member.findMany({where:actor.role==="ADMIN"?{}:{active:true},select:actor.role==="ADMIN"?{id:true,name:true,email:true,role:true,active:true}:{id:true,name:true,active:true},orderBy:{name:"asc"}});
  const tasks=await db().task.findMany({where:actor.role==="MECHANIC"?{assignments:{some:{memberId:actor.id}}}:{},select:{id:true,title:true,orderId:true,status:true,createdAt:true,dueAt:true,assignments:{select:{memberId:true}}},orderBy:{createdAt:"desc"}});
  const technical={...emptyOperations,members,tasks:tasks.map(t=>({id:t.id,title:t.title,orderId:t.orderId,status:t.status,createdAt:t.createdAt.toISOString(),dueAt:t.dueAt?.toISOString(),members:t.assignments.map(a=>a.memberId)}))};
  if(actor.role==="MECHANIC")return technical;
  const [customers,items,suppliers,offers,balances,movements]=await Promise.all([
    db().customer.findMany({orderBy:{name:"asc"},include:{_count:{select:{orders:true}}}}),
    db().catalogItem.findMany({orderBy:{name:"asc"}}),
    db().supplier.findMany({orderBy:{name:"asc"}}),
    db().supplierOffer.findMany({orderBy:{observedAt:"desc"}}),
    db().stockBalance.findMany({}),db().stockMovement.findMany({orderBy:{createdAt:"desc"}}),
  ]);
  const reversed=await db().stockMovement.findMany({where:{reversalOfId:{in:movements.map(m=>m.id)}},select:{reversalOfId:true}});
  const [accounts,obligations,cash]=await Promise.all([
    db().moneyAccount.findMany({select:{id:true,name:true,balance:true},orderBy:{name:"asc"}}),
    db().obligation.findMany({where:actor.role==="ADMIN"?{}:{category:{not:"PAYROLL"}},include:{entries:{select:{amount:true,direction:true}}},orderBy:{dueOn:"desc"}}),
    db().cashEntry.findMany({where:actor.role==="ADMIN"?{}:{OR:[{obligationId:null},{obligation:{category:{not:"PAYROLL"}}}]},orderBy:{createdAt:"desc"},include:{reversal:{select:{id:true}}}}),
  ]);
  return {...technical,
    accounts:accounts.map(a=>({id:a.id,name:a.name,balance:a.balance.toFixed(2)})),
    obligations:obligations.map(o=>({id:o.id,title:o.title,category:o.category,period:o.period,amount:o.amount.toFixed(2),paid:o.entries.reduce((sum,e)=>sum.plus(e.direction==="OUT"?e.amount.toString():new Decimal(e.amount.toString()).negated()),new Decimal(0)).toFixed(2),dueOn:o.dueOn.toISOString().slice(0,10)})),
    cashEntries:cash.map(e=>({id:e.id,accountId:e.accountId,obligationId:e.obligationId,amount:e.amount.toFixed(2),direction:e.direction,kind:e.kind,counterparty:e.counterparty,reference:e.reference,note:e.note,occurredOn:e.occurredOn.toISOString().slice(0,10),reversed:!!e.reversal})),
    customers:customers.map(c=>({id:c.id,name:c.name,document:c.document??"",phone:c.phone??"",email:c.email??"",orders:c._count.orders})),
    items:items.map(i=>({id:i.id,code:i.code,name:i.name,brand:i.brand??"",kind:i.kind,unit:i.unit})),
    suppliers:suppliers.map(s=>({id:s.id,name:s.name,phone:s.phone??""})),
    offers:offers.map(o=>({id:o.id,itemId:o.itemId,supplierId:o.supplierId,condition:o.condition,unitCost:o.unitCost.toFixed(2),reportedStock:o.reportedStock??"",observedAt:o.observedAt.toISOString().slice(0,10),evidence:o.evidence})),
    balances:balances.map(b=>({itemId:b.itemId,locationId:b.locationId,condition:b.condition,quantity:b.quantity.toString(),reserved:b.reserved.toString(),materialCost:b.materialCost.toFixed(2)})),
    movements:movements.map(m=>({id:m.id,itemId:m.itemId,locationId:m.locationId,condition:m.condition,quantity:m.quantity.toString(),materialAmount:m.materialAmount.toFixed(2),kind:m.kind,reason:m.reason,date:m.createdAt.toISOString(),reversed:reversed.some(r=>r.reversalOfId===m.id)})),
  };
}
