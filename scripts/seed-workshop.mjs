import { createHash,randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import pg from 'pg';
import Decimal from 'decimal.js';
import { createClient } from '@supabase/supabase-js';

// Deliberately fixed to this checkout's Docker instance; never accepts a cloud URL.
const connectionString='postgresql://postgres:postgres@127.0.0.1:56322/postgres';
const status=JSON.parse(execFileSync('pnpm.cmd',['dlx','supabase@2.116.0','status','--output','json'],{encoding:'utf8',shell:true,stdio:['ignore','pipe','pipe']}));
if(status.API_URL!=='http://127.0.0.1:56321')throw Error('La instancia local no coincide.');
const id=key=>{const h=createHash('sha256').update('mecanismos-fixtures-v1:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=(days=0)=>{const d=new Date(today+'T15:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString();};
const period=today.slice(0,7);
const db=new pg.Client({connectionString});await db.connect();
const counts={};
async function insert(table,row){const keys=Object.keys(row);await db.query(`INSERT INTO workshop."${table}" (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));counts[table]=(counts[table]??0)+1;}
const people=[['Claudia Rojas','ADMIN'],['Jorge Salcedo','ADMIN'],['Andrés Torres','ADMIN'],['Paola Méndez','OFFICE'],['Diana Pardo','OFFICE'],['Luis Cárdenas','MECHANIC'],['Óscar Peña','MECHANIC'],['Julián Acosta','MECHANIC'],['Camilo Ríos','MECHANIC'],['Héctor Moreno','MECHANIC'],['Diego Beltrán','MECHANIC'],['Raúl Vargas','MECHANIC'],['Sergio Cortés','MECHANIC'],['Wilson Duarte','MECHANIC'],['Felipe Lozano','MECHANIC'],['Edwin Castro','MECHANIC']];
const offices=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
const customers=['Transportes Alto de la Cruz SAS','Distribuciones La Rivera SAS','Mauricio Sánchez','Agroinsumos El Robledal','Logística Las Acacias SAS','Patricia Gómez','Taller Automotriz Los Sauces','Carga Urbana del Centro SAS','Víctor Alarcón','Repuestos y Servicios La Alameda','Andrés Felipe Rincón','Transportes San Jerónimo y Asociados SAS'];
const suppliers=['Diésel Repuestos del Altiplano','Importadora Transmisiones Central','Suministros Industriales El Roble','Partes para Motores La Sabana','Distribuidora Hidráulica del Norte','Rectificadora Los Cedros'];
const parts=[
 ['INY-AR-01','Arandela de sello para inyector','unidad',8500],['INY-RET-01','Kit de sellos de retorno de inyectores','juego',65000],['INY-TOB-01','Tobera para inyector diésel','unidad',285000],['BOM-EMP-01','Juego de empaques para bomba de inyección','juego',185000],['BOM-VAL-01','Válvula dosificadora de combustible','unidad',420000],['COM-FIL-01','Filtro de combustible','unidad',95000],['TRA-DIS-01','Juego de discos de fricción para transmisión','juego',680000],['TRA-EMP-01','Kit de empaques para transmisión automática','juego',340000],['TRA-FIL-01','Filtro de aceite para transmisión','unidad',115000],['TRA-ATF-01','Aceite ATF para transmisión automática','litro',42000],['MOT-COJ-01','Juego de cojinetes de bancada','juego',520000],['MOT-ANI-01','Juego de anillos de pistón','juego',390000],['MOT-EMP-01','Empaque de culata','unidad',280000],['MOT-RET-01','Retén trasero de cigüeñal','unidad',95000],['MOT-ACE-01','Aceite para motor diésel','litro',28500],['LIM-DES-01','Desengrasante para lavado de piezas','litro',18000],['TRA-SOL-01','Solenoide de cambio','unidad',310000],['BOM-REP-01','Cuerpo de bomba recuperado','unidad',750000],
];
const jobs=[
 ['Chevrolet NHR · inyectores','VEHICLE','TST101','DIAGNOSING','Arranque largo en frío y humo blanco durante los primeros minutos.','Medir retorno de los cuatro inyectores'],
 ['Transmisión automática · Mazda BT-50','COMPONENT','CAJA-208','IN_PROGRESS','Golpe al pasar de segunda a tercera con la caja caliente.','Revisar discos del conjunto de tercera'],
 ['Isuzu NPR · bomba de inyección','VEHICLE','TST103','ON_HOLD','Pierde fuerza en subida; el cliente reporta apagado al exigir el motor.','Esperar válvula dosificadora'],
 ['Bomba de inyección · banco de pruebas','COMPONENT','BOM-114','QUALITY_REVIEW','Fuga por la tapa lateral de la bomba.','Registrar caudal y estanqueidad'],
 ['Toyota Hilux · sellos de inyectores','VEHICLE','TST105','READY','Olor a combustible dentro de la cabina.','Cambiar sellos y comprobar fugas'],
 ['Motor diésel · reconstrucción','COMPONENT','UP-031','IN_PROGRESS','Unidad del taller para recuperar; pendiente medir cilindros y cigüeñal.','Medir desgaste del cigüeñal'],
 ['Ford Ranger · transmisión','VEHICLE','TST107','RECEIVED','Patina al salir en pendiente. Ingresó en grúa.','Revisar nivel y estado del aceite'],
 ['Juego de inyectores · cuatro unidades','COMPONENT','INY-076','DIAGNOSING','El taller remitente solicita prueba de retorno y pulverización.','Probar cada inyector y marcar resultados'],
 ['Chevrolet NPR · motor','VEHICLE','TST109','IN_PROGRESS','Consumo de aceite y pérdida de compresión.','Montar anillos y verificar luz'],
 ['Kia K2700 · bomba','VEHICLE','TST110','ON_HOLD','Fuga de combustible. Cliente pendiente de autorizar el cambio del eje.','Llamar al cliente para confirmar reparación'],
 ['Cuerpo de válvulas · transmisión','COMPONENT','VAL-052','QUALITY_REVIEW','Cambios tardíos; se recibió únicamente el cuerpo de válvulas.','Comprobar funcionamiento de solenoides'],
 ['Nissan Frontier · inyección','VEHICLE','TST112','CLOSED','Pérdida intermitente de potencia.','Probar en carretera después del montaje'],
];
try {
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(5632201)');
 const seeded=await db.query('SELECT id FROM workshop."AuditEvent" WHERE id=$1',[id('seed')]);
 if(!seeded.rowCount){
  for(let i=0;i<people.length;i++)await insert('Member',{id:id('member'+i),name:people[i][0],role:people[i][1],email:`persona${i+1}@taller.example.invalid`,active:i!==15});
  for(let i=0;i<customers.length;i++)await insert('Customer',{id:id('customer'+i),name:customers[i],document:`FICT-${String(i+1).padStart(4,'0')}`,phone:i===8?null:`+57 601 555 ${String(100+i).padStart(4,'0')}`,email:i===8?null:`cliente${i+1}@example.invalid`});
  for(let i=0;i<suppliers.length;i++)await insert('Supplier',{id:id('supplier'+i),name:suppliers[i],phone:`+57 601 555 ${String(100+i).padStart(4,'0')}`});
  for(let i=0;i<parts.length;i++)await insert('CatalogItem',{id:id('item'+i),code:parts[i][0],name:parts[i][1],kind:'PART',unit:parts[i][2],brand:i===17?'Recuperado en taller':null});
  for(const [i,name] of ['Diagnóstico de sistema de inyección','Prueba de inyectores en banco','Reparación de bomba de inyección','Reparación de transmisión automática','Armado de motor diésel'].entries())await insert('CatalogItem',{id:id('service'+i),code:`SRV-${i+1}`,name,kind:'SERVICE',unit:'servicio'});
  for(let i=0;i<24;i++){
   const j=jobs[i%12],own=i%12===5,closed=j[3]==='CLOSED',customerId=own?null:id('customer'+i%12),received=date(-i-1);
   await insert('Asset',{id:id('asset'+i),kind:j[1],description:j[0],plate:j[1]==='VEHICLE'?`TST${101+i}`:null,serial:j[1]==='COMPONENT'?`${j[2]}-${i+1}`:null,customerId});
   await insert('WorkOrder',{id:id('order'+i),purpose:own?'OWN_REBUILD':'CUSTOMER_REPAIR',status:i===23?'CANCELLED':j[3],title:j[0],reportedProblem:j[4],authorization:own?'Reconstrucción aprobada para inventario del taller.':'Autoriza diagnóstico. Consultar cambios de piezas antes de instalarlas.',customerId,locationId:offices[i%4===0?0:1],receivedAt:received,dueAt:date(i%4-2),closedAt:closed||i===23?date(-1):null});
   await insert('OrderAsset',{orderId:id('order'+i),assetId:id('asset'+i)});
   for(let t=0;t<2;t++){
    const done=t===0||['READY','CLOSED','QUALITY_REVIEW','CANCELLED'].includes(j[3])||i===23;
    await insert('Task',{id:id(`task${i}-${t}`),orderId:id('order'+i),title:t===0?'Revisar ingreso y registrar estado de la unidad':j[5],status:done?'DONE':j[3]==='ON_HOLD'?'BLOCKED':j[3]==='IN_PROGRESS'?'IN_PROGRESS':'TODO',createdAt:received,dueAt:date(i%4-2)});
    await insert('TaskAssignment',{taskId:id(`task${i}-${t}`),memberId:id('member'+(5+i%10))});
    if(t===1&&i%3===0)await insert('TaskAssignment',{taskId:id(`task${i}-${t}`),memberId:id('member'+(5+(i+1)%10))});
    if(done||j[3]==='IN_PROGRESS')await insert('TimeEntry',{id:id(`time${i}-${t}`),taskId:id(`task${i}-${t}`),memberId:id('member'+(5+i%10)),minutes:t===0?25:135,workedOn:received.slice(0,10),note:t===0?'Se revisó la unidad con la lista de ingreso.':j[5]+'. Se dejó el resultado en la orden.',idempotencyKey:id(`time-key${i}-${t}`),createdAt:received});
   }
   await insert('Observation',{id:id('note'+i),orderId:id('order'+i),memberId:id('member3'),body:i%12===2?'Proveedor confirma llegada de la válvula el viernes. Paola debe llamar antes de enviar mensajero.':i%12===4?'Se completó la prueba sin fugas. Cliente pasa mañana después de las 3 p. m.':i%12===9?'Se llamó al cliente a las 11:20 a. m. Solicita precio del eje antes de autorizar.':j[4],createdAt:date(-Math.max(1,i))});
  }
  for(const [i,title] of ['Limpiar el banco de pruebas y cambiar filtro','Contar arandelas de inyector en la bodega','Recoger empaques donde el proveedor','Revisar extintores del taller'].entries()){
   await insert('Task',{id:id('general'+i),title,status:i===2?'IN_PROGRESS':'TODO',dueAt:date(i-1)});
   await insert('TaskAssignment',{taskId:id('general'+i),memberId:id('member'+(i===2?3:5+i))});
  }
  // Opening stock is represented by receipts so every balance reconciles.
  for(let i=0;i<parts.length;i++){
   for(let l=0;l<2;l++){
    const condition=i===17?'REBUILT':'NEW';const qty=i===4?0:l===0?2:i%4===0?24:8;const consumed=qty>0&&l===1?2:0;const amount=new Decimal(parts[i][3]).mul(qty);
    await insert('StockBalance',{itemId:id('item'+i),locationId:offices[l],condition,quantity:qty-consumed,reserved:i===0&&l===1?4:0,materialCost:amount.minus(new Decimal(parts[i][3]).mul(consumed)).toFixed(2)});
    if(qty)await insert('StockMovement',{id:id(`receipt${i}-${l}`),itemId:id('item'+i),locationId:offices[l],condition,quantity:qty,materialAmount:amount.toFixed(2),reason:'Conteo de apertura del inventario local.',kind:'RECEIPT',actorId:id('member3'),createdAt:date(-30)});
    if(consumed)await insert('StockMovement',{id:id('consumption'+i),itemId:id('item'+i),locationId:offices[l],condition,quantity:-consumed,materialAmount:new Decimal(parts[i][3]).mul(-consumed).toFixed(2),reason:'Repuestos entregados al mecánico para la orden.',kind:'CONSUMPTION',actorId:id('member3'),orderId:id('order'+[0,7,0,3,2,0,1,1,1,1,5,8,8,5,8,7,10,3][i]),createdAt:date(-1)});
   }
   for(let o=0;o<2;o++)await insert('SupplierOffer',{id:id(`offer${i}-${o}`),itemId:id('item'+i),supplierId:id('supplier'+(i+o)%6),condition:i===17?'REBUILT':'NEW',unitCost:new Decimal(parts[i][3]).mul(o?1.12:1).toFixed(2),reportedStock:i===4?'Por encargo, entrega en 5 días':o?'2 unidades, confirmar antes de recoger':'Disponible para recoger',observedAt:date(o?-45:-2),evidence:o?'Precio recibido por teléfono el mes pasado. Requiere confirmación.':'Precio recibido por mensaje. No incluye envío.'});
  }
  const openings=[2500000,22000000,0],balances=openings.map(v=>new Decimal(v));
  for(const [i,name] of ['Caja oficina','Cuenta bancaria del taller','Caja menor bodega'].entries())await insert('MoneyAccount',{id:id('account'+i),name,openingBalance:openings[i],balance:openings[i]});
  const obligations=[['Arriendo oficina','RENT',2800000],['Arriendo bodega y taller','RENT',4500000],['Energía del taller','UTILITIES',780000],['Agua del taller','UTILITIES',165000],['Internet oficina','UTILITIES',145000],['Salarios primera quincena','PAYROLL',14500000],['Prestaciones del mes','PAYROLL',4200000],['Recolección de residuos','OTHER',280000]];
  for(const [i,[title,category,amount]] of obligations.entries())await insert('Obligation',{id:id('obligation'+i),title,category,period,amount,dueOn:`${period}-${i<2?'05':i<5?'12':'15'}`});
  const cash=[['EXPENSE_PAYMENT','OUT',2800000,0,'Arrendador oficina'],['EXPENSE_PAYMENT','OUT',2000000,1,'Arrendador bodega'],['EXPENSE_PAYMENT','OUT',145000,4,'Proveedor de internet'],['EXPENSE_PAYMENT','OUT',5000000,5,'Personal del taller'],['CUSTOMER_PAYMENT','IN',3800000,null,customers[0]],['CUSTOMER_ADVANCE','IN',1500000,null,customers[1]],['OWNER_CONTRIBUTION','IN',3000000,null,'Jorge Salcedo'],['LOAN_RECEIVED','IN',5000000,null,'Entidad financiera'],['SUPPLIER_PAYMENT','OUT',1850000,null,suppliers[0]],['CUSTOMER_PAYMENT','IN',960000,null,customers[2]],['CUSTOMER_REFUND','OUT',150000,null,customers[5]]];
  for(const [i,[kind,direction,amount,obligation,counterparty]] of cash.entries()){
   const account=i===9||i===10?0:1;balances[account]=balances[account].plus(direction==='IN'?amount:-amount);
   await insert('CashEntry',{id:id('cash'+i),accountId:id('account'+account),obligationId:obligation===null?null:id('obligation'+obligation),kind,direction,amount,counterparty,reference:`PRUEBA-${String(i+1).padStart(3,'0')}`,note:obligation===null?'Comprobante del escenario de prueba.':'Abono a '+obligations[obligation][0].toLowerCase()+'.',occurredOn:date(-Math.min(9,i)).slice(0,10),actorId:id('member0'),createdAt:date(-Math.min(9,i))});
  }
  for(let i=0;i<3;i++)await db.query('UPDATE workshop."MoneyAccount" SET balance=$1 WHERE id=$2',[balances[i].toFixed(2),id('account'+i)]);
  await insert('AuditEvent',{id:id('seed'),actorId:id('member0'),entityId:id('seed'),action:'LOCAL_FIXTURES_LOADED',details:JSON.stringify({version:1,today,counts})});
 }
 await db.query('COMMIT');
 // Dedicated Auth users exercise the same cookies and Member checks as Google.
 const auth=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 await mkdir('.secrets',{recursive:true});
 let credentials;try{credentials=JSON.parse(await readFile('.secrets/local-users.json','utf8'));}catch{credentials={};}
 for(const [role,index] of [['admin',0],['office',3],['mechanic',5]]){
  const email=`persona${index+1}@taller.example.invalid`;
  const stored=await db.query('SELECT "authSubject" FROM workshop."Member" WHERE id=$1',[id('member'+index)]);
  let subject=stored.rows[0].authSubject;
  if(subject){const existing=await auth.auth.admin.getUserById(subject);if(existing.error)subject=null;}
  const password=credentials[role]?.password??randomBytes(32).toString('hex');
  if(!subject){const {data,error}=await auth.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;subject=data.user.id;await db.query('UPDATE workshop."Member" SET "authSubject"=$1 WHERE id=$2',[subject,id('member'+index)]);}
  else if(!credentials[role]){const {error}=await auth.auth.admin.updateUserById(subject,{password});if(error)throw error;}
  credentials[role]={email,password};
 }
 await writeFile('.secrets/local-users.json',JSON.stringify(credentials),{mode:0o600});
 const env=await readFile('.env.local','utf8');
 if(!env.includes('LOCAL_TEST_ACCESS='))await writeFile('.env.local',env.trimEnd()+'\nLOCAL_TEST_ACCESS=true\n');
 console.log(seeded.rowCount?'Datos existentes conservados; accesos locales preparados.':JSON.stringify({loaded:counts,period}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
