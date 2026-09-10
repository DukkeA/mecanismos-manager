"use client";
import { Alert,AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field,FieldGroup,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { orderTransitions } from "@/domain/order-lifecycle";
import type { OrderView } from "@/domain/workshop-view";
import { statusLabels } from "@/domain/workshop-view";
import { useState } from "react";
import { Choice } from "./workshop-controls";

export function OrderControls({order,run}:{order:OrderView;run:(kind:string,input:Record<string,unknown>)=>Promise<void>}) {
  const [pending,setPending]=useState(false);const [error,setError]=useState("");
  const next=orderTransitions[order.status]??[];
  if(!next.length)return null;
  return <form onSubmit={async e=>{e.preventDefault();const element=e.currentTarget;const data=new FormData(element);setPending(true);setError("");try{await run("order-status",{requestId:crypto.randomUUID(),orderId:order.id,version:order.version??0,status:String(data.get("status")),reason:String(data.get("reason"))});element.reset();}catch(err){setError(err instanceof Error?err.message:"No se pudo actualizar.");}finally{setPending(false);}}}><FieldGroup><Field><FieldLabel htmlFor="order-status">Avanzar orden</FieldLabel><Choice id="order-status" name="status" key={order.status} options={next.map(s=>({id:s,label:statusLabels[s]}))}/></Field><Field><FieldLabel htmlFor="transition-reason">Motivo del cambio</FieldLabel><Input id="transition-reason" name="reason" required minLength={3} maxLength={1000}/></Field>{error&&<Alert variant="destructive"><AlertTitle>{error}</AlertTitle></Alert>}<Button type="submit" variant="outline" disabled={pending}>{pending?"Guardando…":"Actualizar estado"}</Button></FieldGroup></form>;
}
