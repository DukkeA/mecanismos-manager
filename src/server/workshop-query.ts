import "server-only";
import { db } from "./db";
import type { Role } from "@/domain/permissions";
import type { OrderView } from "@/domain/workshop-view";

export async function getOrders(actor: {id:string; role:Role}): Promise<OrderView[]> {
  const orders = await db().workOrder.findMany({
    where: actor.role === "MECHANIC" ? {tasks: {some:{assignments:{some:{memberId:actor.id}}}}} : {},
    orderBy: {receivedAt:"desc"},
    select: {id:true,number:true,title:true,reportedProblem:true,status:true,purpose:true,version:true,receivedAt:true,dueAt:true,closedAt:true,
      customer:{select:{name:true}},location:{select:{name:true}},
      assets:{select:{asset:{select:{kind:true,plate:true,serial:true,description:true}}}},
      tasks:{select:{id:true,title:true,status:true,assignments:{select:{member:{select:{name:true}}}},timeEntries:{select:{minutes:true}}}},
      observations:{orderBy:{createdAt:"desc"},take:30,select:{id:true,body:true,createdAt:true,member:{select:{name:true}}}},
    },
  });
  return orders.map(order => {
    const asset = order.assets[0]?.asset;
    return {id:order.id,number:order.number,title:order.title,reference:asset?.plate ?? asset?.serial ?? "Sin referencia",kind:asset?.kind ?? "COMPONENT",
      family:order.purpose === "OWN_REBUILD" ? "Unidad propia" : (asset?.description && asset.description !== order.title ? asset.description : asset?.kind === "VEHICLE" ? "Vehículo" : "Componente suelto"),status:order.status,
      responsible:[...new Set(order.tasks.flatMap(t => t.assignments.map(a => a.member.name)))].join(", ") || "Sin asignar",
      nextStep:order.tasks.find(t => t.status !== "DONE")?.title ?? (order.status === "CLOSED" ? "Trabajo entregado" : order.status === "CANCELLED" ? "Trabajo cancelado" : order.status === "READY" ? "Coordinar entrega" : order.status === "QUALITY_REVIEW" ? "Revisar resultados de pruebas" : "Asignar tarea"),customer:order.customer?.name ?? "Mecanismos · unidad propia",
      problem:order.reportedProblem,location:order.location.name,version:order.version,receivedAt:order.receivedAt.toISOString(),dueAt:order.dueAt?.toISOString(),closedAt:order.closedAt?.toISOString(),
      tasks:order.tasks.map(t => ({id:t.id,title:t.title,done:t.status === "DONE",status:t.status,minutes:t.timeEntries.reduce((s,e)=>s+e.minutes,0)})),
      notes:order.observations.map(o=>({id:o.id,body:o.body,author:o.member.name,createdAt:o.createdAt.toISOString(),date:o.createdAt.toLocaleString("es-CO",{timeZone:"America/Bogota"})})),
    };
  });
}
