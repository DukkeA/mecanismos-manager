import {requireMember} from '@/server/auth';
import {managementReport} from '@/server/management-report';
export async function GET(request:Request){
 const actor=await requireMember().catch(()=>null);
 if(actor?.role!=='ADMIN')return Response.json({error:'Sin permiso.'},{status:403});
 try{return Response.json(await managementReport(actor,new URL(request.url).searchParams),{headers:{'Cache-Control':'private, no-store'}});}
 catch{return Response.json({error:'No se pudo consultar el informe.'},{status:400});}
}
