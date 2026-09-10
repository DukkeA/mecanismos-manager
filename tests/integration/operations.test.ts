import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { receiveOrder,assignTask,changeTaskStatus,transitionOrder } from "@/server/operations-service";
import { moveStock,reverseMovement } from "@/server/inventory-service";
import { getOperations } from "@/server/operations-query";

const admin={id:randomUUID(),role:"ADMIN" as const};
const mechanic={id:randomUUID(),role:"MECHANIC" as const};
const outsider={id:randomUUID(),role:"MECHANIC" as const};
const ids=[admin.id,mechanic.id,outsider.id];
const itemId=randomUUID();
const locationId="00000000-0000-4000-8000-000000000002";
let orderId:string;
let taskId:string;

beforeAll(async()=>{
  await db().member.createMany({data:[admin,mechanic,outsider].map(a=>({...a,name:"Operations test",email:`${a.id}@example.invalid`}))});
  await db().catalogItem.create({data:{id:itemId,code:itemId,name:"Test part",kind:"PART"}});
});
afterAll(async()=>{
  const order=orderId?await db().workOrder.findUnique({where:{id:orderId},include:{assets:true}}):null;
  await db().auditEvent.deleteMany({where:{actorId:{in:ids}}});
  await db().commandReceipt.deleteMany({where:{actorId:{in:ids}}});
  await db().stockMovement.deleteMany({where:{actorId:{in:ids}}});
  await db().stockBalance.deleteMany({where:{itemId}});
  await db().catalogItem.deleteMany({where:{id:itemId}});
  if(taskId){await db().taskAssignment.deleteMany({where:{taskId}});await db().task.delete({where:{id:taskId}});}
  if(order){await db().orderAsset.deleteMany({where:{orderId}});await db().workOrder.delete({where:{id:orderId}});await db().asset.deleteMany({where:{id:{in:order.assets.map(a=>a.assetId)}}});if(order.customerId)await db().customer.delete({where:{id:order.customerId}});}
  await db().member.deleteMany({where:{id:{in:ids}}});
  await db().$disconnect();
});

describe("operational transactions against PostgreSQL",()=>{
  it("receives once on concurrent retries",async()=>{
    const input={requestId:randomUUID(),title:"Test injection pump",customer:"Test customer",reference:"TEST",dueAt:"2026-09-20",kind:"COMPONENT",problem:"Needs pressure test",locationId};
    const [a,b]=await Promise.all([receiveOrder(admin,input),receiveOrder(admin,input)]);
    expect(a).toEqual(b);orderId=a.id as string;
    expect((await db().workOrder.findUniqueOrThrow({where:{id:orderId}})).dueAt?.toISOString()).toBe("2026-09-20T17:00:00.000Z");
  });
  it("enforces assignments and versioned lifecycle",async()=>{
    const task=await assignTask(admin,{requestId:randomUUID(),orderId,title:"Pressure test",dueAt:"2026-09-19",memberIds:[mechanic.id]});taskId=task.id as string;
    expect((await db().task.findUniqueOrThrow({where:{id:taskId}})).dueAt?.toISOString()).toBe("2026-09-19T17:00:00.000Z");
    await expect(changeTaskStatus(outsider,{taskId,status:"DONE"})).rejects.toThrow("permiso");
    await transitionOrder(admin,{requestId:randomUUID(),orderId,version:0,status:"DIAGNOSING",reason:"Reception checked"});
    await expect(transitionOrder(admin,{requestId:randomUUID(),orderId,version:0,status:"IN_PROGRESS",reason:"Stale version"})).rejects.toThrow("cambió");
    await transitionOrder(admin,{requestId:randomUUID(),orderId,version:1,status:"IN_PROGRESS",reason:"Work started"});
    await expect(transitionOrder(admin,{requestId:randomUUID(),orderId,version:2,status:"QUALITY_REVIEW",reason:"Review requested"})).rejects.toThrow("tareas pendientes");
    await changeTaskStatus(mechanic,{taskId,status:"DONE"});
  });
  it("values weighted material cost and prevents concurrent overdraw",async()=>{
    for(const cost of ["100","300"])await moveStock(admin,{requestId:randomUUID(),itemId,locationId,condition:"NEW",quantity:"10",unitCost:cost,kind:"RECEIPT",reason:"Test receipt"});
    const outcomes=await Promise.allSettled([1,2].map(()=>moveStock(admin,{requestId:randomUUID(),itemId,locationId,condition:"NEW",quantity:"15",kind:"CONSUMPTION",orderId,reason:"Test consumption"})));
    expect(outcomes.filter(o=>o.status==="fulfilled")).toHaveLength(1);
    const balance=await db().stockBalance.findUniqueOrThrow({where:{itemId_locationId_condition:{itemId,locationId,condition:"NEW"}}});
    expect(balance.quantity.toString()).toBe("5");expect(balance.materialCost.toString()).toBe("1000");
    const successful=outcomes.find(o=>o.status==="fulfilled") as PromiseFulfilledResult<{id:string}>;
    const reverse={requestId:randomUUID(),movementId:successful.value.id,reason:"Reverse test consumption"};
    expect(await reverseMovement(admin,reverse)).toEqual(await reverseMovement(admin,reverse));
    expect((await db().stockBalance.findFirstOrThrow({where:{itemId}})).quantity.toString()).toBe("20");
  });
  it("does not expose or mutate inventory as a mechanic",async()=>{
    const view=await getOperations(mechanic);
    expect(view.items).toEqual([]);expect(view.offers).toEqual([]);expect(view.customers).toEqual([]);
    expect(view.members.every(m=>!("email" in m)&&!("role" in m))).toBe(true);
    await expect(moveStock(mechanic,{requestId:randomUUID(),itemId,locationId,condition:"NEW",quantity:"1",unitCost:"100",kind:"RECEIPT",reason:"Forbidden"})).rejects.toThrow("permiso");
  });
  it("grants runtime only append access to ledgers",async()=>{
    const result=await db().$queryRaw<{allowed:boolean}[]>`SELECT has_table_privilege('workshop_runtime','workshop."StockMovement"','UPDATE') AS allowed`;
    expect(result[0].allowed).toBe(false);
  });
});
