import { requireMember } from "@/server/auth";
import { commercialPage } from "@/server/commercial-query";
import { AccessDenied } from "@/domain/permissions";
import { ZodError } from "zod";
export async function GET(request: Request) {
  const headers={"Cache-Control":"private, no-store"};
  const actor=await requireMember().catch(()=>null);
  if(!actor)return Response.json({error:"Sesión requerida."},{status:401,headers});
  try{return Response.json(await commercialPage(actor,new URL(request.url).searchParams),{headers});}
  catch(error){return Response.json({error:error instanceof AccessDenied?error.message:error instanceof ZodError?"Revisa los filtros de la consulta.":"No se pudieron consultar los documentos."},{status:error instanceof AccessDenied?403:error instanceof ZodError?400:500,headers});}
}
