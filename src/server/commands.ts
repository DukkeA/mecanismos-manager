import { DomainError } from "@/domain/errors";
import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/domain/permissions";

export type Actor = {id:string;role:Role};
export type Tx = Prisma.TransactionClient;

export async function serializable<T>(run:(tx:Tx)=>Promise<T>):Promise<T> {
  for(let attempt=0; ;attempt++) {
    try {return await db().$transaction(run,{isolationLevel:"Serializable"});}
    catch(error) {
      const prismaConflict=error instanceof Prisma.PrismaClientKnownRequestError && ["P2034","P2002"].includes(error.code);
      // The pg adapter can surface a serialization failure directly at COMMIT.
      const adapterConflict=error instanceof Error && error.name==="DriverAdapterError" && error.message==="TransactionWriteConflict";
      if((!prismaConflict&&!adapterConflict)||attempt>=3) throw error;
      await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));
    }
  }
}

export async function once<T extends Prisma.InputJsonObject>(actor:Actor,id:string,kind:string,payload:unknown,run:(tx:Tx)=>Promise<T>):Promise<T> {
  const payloadHash=createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return serializable(async tx=>{
    const previous=await tx.commandReceipt.findUnique({where:{id}});
    if(previous) {
      if(previous.actorId!==actor.id||previous.kind!==kind||previous.payloadHash!==payloadHash) throw new DomainError("La solicitud ya existe con datos diferentes.");
      return previous.result as T;
    }
    const result=await run(tx);
    await tx.commandReceipt.create({data:{id,actorId:actor.id,kind,payloadHash,result}});
    return result;
  });
}
