import {beforeAll,afterAll,it,expect} from "vitest";
import {randomUUID as uuid} from "node:crypto";
import {db} from "@/server/db";
import {productResults} from "@/server/product-results";
const actor={id:uuid(),role:"ADMIN" as const},customerId=uuid(),locationId=uuid(),orderId=uuid(),taskId=uuid(),prefix=`Informe ${uuid()}`,parts=Array.from({length:12},()=>uuid()),services=[uuid(),uuid()];
beforeAll(async()=>{
 await db().member.create({data:{...actor,name:prefix,email:`${actor.id}@example.invalid`}});
 await db().customer.create({data:{id:customerId,name:prefix}});await db().location.create({data:{id:locationId,code:uuid().slice(0,20),name:prefix}});
 await db().catalogItem.createMany({data:[...parts.map((id,i)=>({id,code:id,name:`${prefix} repuesto ${i+1}`,kind:"PART" as const})),...services.map((id,i)=>({id,code:id,name:`${prefix} servicio ${i+1}`,kind:"SERVICE" as const}))]});
 await db().workOrder.create({data:{id:orderId,customerId,locationId,purpose:"CUSTOMER_REPAIR",status:"CLOSED",title:prefix,reportedProblem:prefix}});
 await db().task.create({data:{id:taskId,orderId,title:prefix}});await db().laborRate.create({data:{memberId:actor.id,effectiveOn:new Date("2026-08-01"),hourlyCost:30000,note:prefix,actorId:actor.id}});
 await db().timeEntry.create({data:{taskId,memberId:actor.id,workedOn:new Date("2026-08-05"),minutes:60,idempotencyKey:uuid(),note:prefix}});
 const sale={customerId,locationId,actorId:actor.id,title:prefix,terms:prefix,issuedOn:new Date("2026-08-05"),dueOn:new Date("2026-08-05")};
 await db().sale.create({data:{...sale,kind:"REPAIR",orderId,total:100000,lines:{create:services.map((itemId,i)=>({itemId,description:prefix,reference:"",kind:"SERVICE",condition:"NEW",quantity:1,unitPrice:i?60000:40000,total:i?60000:40000,materialCost:0}))}}});
 await db().sale.create({data:{...sale,kind:"COUNTER",total:780000,lines:{create:parts.map((itemId,i)=>({itemId,description:prefix,reference:"",kind:"PART",condition:i%2?"USED":"NEW",quantity:1,unitPrice:(i+1)*10000,total:(i+1)*10000,materialCost:5000}))}}});
});
afterAll(async()=>{
 await db().saleLine.deleteMany({where:{itemId:{in:[...parts,...services]}}});await db().sale.deleteMany({where:{customerId}});await db().timeEntry.deleteMany({where:{taskId}});await db().task.delete({where:{id:taskId}});await db().laborRate.deleteMany({where:{memberId:actor.id}});await db().workOrder.delete({where:{id:orderId}});await db().catalogItem.deleteMany({where:{id:{in:[...parts,...services]}}});await db().customer.delete({where:{id:customerId}});await db().location.delete({where:{id:locationId}});await db().member.delete({where:{id:actor.id}});
});
it("sorts money numerically before pagination and keeps category totals stable",async()=>{
 const q=new URLSearchParams({q:prefix,orderBy:"revenue",direction:"desc"});const a=await productResults(actor,q);q.set("page","2");const b=await productResults(actor,q);
 expect(a.total).toBe(14);expect(a.rows).toHaveLength(10);expect(b.rows).toHaveLength(4);const numbers=[...a.rows,...b.rows].map(r=>Number(r.revenue));expect(numbers).toEqual([...numbers].sort((a,b)=>b-a));expect(a.categories).toEqual(b.categories);
});
it("allocates the closed order labor once across its services",async()=>{
 const report=await productResults(actor,new URLSearchParams({q:prefix,category:"SERVICE"}));expect(report.rows).toHaveLength(2);expect(report.rows.reduce((s,r)=>s+Number(r.cost),0)).toBe(30000);expect(report.rows.reduce((s,r)=>s+Number(r.margin),0)).toBe(70000);
 expect(report.rows.find(r=>r.id===services[0])?.cost).toBe("12000.00");
});
