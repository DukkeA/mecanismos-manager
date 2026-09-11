import {db} from '../src/server/db';
import {saveQuote,decideQuote} from '../src/server/quote-service';
import {issueSale,returnSale} from '../src/server/sales-service';
import {receivePayment,applyPayment} from '../src/server/payment-service';
import {randomUUID,createHash} from 'node:crypto';
if(!process.env.DATABASE_URL?.includes('127.0.0.1:56322/'))throw Error('Solo se permite la base local de pruebas');
const id=(key:string)=>{const hex=createHash('sha256').update(`commerce-fixtures-v1:${key}`).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;};
const actor=await db().member.findFirstOrThrow({where:{role:'ADMIN',active:true,email:{not:{endsWith:'@example.invalid'}}}});
const order=await db().workOrder.findFirstOrThrow({where:{customerId:{not:null},status:{notIn:['CANCELLED','CLOSED']},customer:{deletedAt:null}},orderBy:{number:'asc'}});
const service=await db().catalogItem.findFirstOrThrow({where:{kind:'SERVICE'}}),account=await db().moneyAccount.findUniqueOrThrow({where:{name:'Oficina'}});
const input={customerId:order.customerId!,orderId:order.id,locationId:order.locationId,title:'Reparación y calibración de bomba de inyección',terms:'Desmontaje, cambio de empaques y prueba de caudal en banco. Los daños adicionales requieren autorización.',lines:[{itemId:service.id,description:'Reparación, calibración y prueba de bomba',quantity:'1',unitPrice:'1000000',discount:'0',condition:'NEW'}],issuedOn:'2026-09-11',dueOn:'2026-09-30'};
try{
 const quote=await saveQuote(actor,{...input,requestId:id('quote'),validUntil:'2026-09-30'});
 await decideQuote(actor,{requestId:id('approval'),quoteId:quote.id,decision:'APPROVED',approvedBy:'Carlos Rincón',note:'Datos de prueba: autorización telefónica del alcance y precio.'});
 const sale=await issueSale(actor,{...input,requestId:id('sale'),quoteId:quote.id});
 const advance=await receivePayment(actor,{requestId:id('advance'),customerId:input.customerId,accountId:account.id,amount:'300000',occurredOn:'2026-09-11',note:'Anticipo de prueba recibido para la reparación',reference:'PRUEBA-COM-01'});
 await applyPayment(actor,{requestId:id('apply'),paymentId:advance.id,saleId:sale.id,amount:'300000',note:'Aplicación del anticipo a la venta de prueba'});
 await receivePayment(actor,{requestId:id('payment'),customerId:input.customerId,accountId:account.id,saleId:sale.id,amount:'200000',occurredOn:'2026-09-11',note:'Segundo abono de prueba',reference:'PRUEBA-COM-02'});
 await saveQuote(actor,{...input,requestId:id('pending-quote'),orderId:undefined,title:'Escaneo y diagnóstico de transmisión automática',validUntil:'2026-09-25',lines:[{...input.lines[0],description:'Lectura de códigos y prueba de ruta',unitPrice:'180000'}]});
 console.log('Cotización aprobada, venta de reparación, dos cobros y una cotización pendiente. Saldo de la venta: $500.000.');
}finally{await db().$disconnect();}
