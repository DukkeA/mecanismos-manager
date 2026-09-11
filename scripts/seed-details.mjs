import pg from 'pg';
import { createHash } from 'node:crypto';
// Only the isolated local fixture database. No rows are removed or replaced.
const client=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:56322/postgres'});
const id=key=>{const h=createHash('sha256').update('mecanismos-fixtures-v1:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
await client.connect();
try {
 await client.query('BEGIN');
 const actor=await client.query('SELECT id FROM workshop."Member" WHERE email=$1',['persona6@taller.example.invalid']);
 if(!actor.rowCount)throw Error('Carga primero los datos de prueba del taller.');
 const descriptions=['Registrar el estado al recibir la unidad. Revisar conectores, mangueras y fugas antes de desmontar.','Medir presión y retorno. Anotar valores por cilindro y avisar a oficina si se requieren repuestos.'];
 for(let i=0;i<24;i++)for(let t=0;t<2;t++){
  const taskId=id(`task${i}-${t}`);
  await client.query('UPDATE workshop."Task" SET description=$1 WHERE id=$2 AND description=\'\'',[descriptions[t],taskId]);
  if(i<3&&t===1){
   await client.query('INSERT INTO workshop."TaskNote" (id,"taskId","actorId",body) SELECT $1,id,$3,$4 FROM workshop."Task" WHERE id=$2 ON CONFLICT(id) DO NOTHING',[id(`detail-note-${i}`),taskId,actor.rows[0].id,['Se revisaron mangueras y conectores. Falta medir retorno con el motor frío.','Aceite oscuro y residuos en el cárter. Se guardaron las piezas para comparar.','La válvula sigue pendiente. Oficina confirmó consulta al proveedor.'][i]]);
   await client.query('INSERT INTO workshop."AuditEvent" (id,"actorId",action,"entityId",details) SELECT $1,$2,\'TASK_NOTE_ADDED\',id,$4::jsonb FROM workshop."Task" WHERE id=$3 ON CONFLICT(id) DO NOTHING',[id(`detail-audit-${i}`),actor.rows[0].id,taskId,JSON.stringify({noteId:id(`detail-note-${i}`)})]);
  }
 }
 for(let i=0;i<18;i++)await client.query('UPDATE workshop."CatalogItem" SET reference=$1, notes=$2 WHERE id=$3 AND reference=\'\' AND notes=\'\'',[`REF-PRUEBA-${String(i+1).padStart(3,'0')}`,'Referencia de prueba. Confirmar aplicación y número grabado en la pieza antes de pedir al proveedor.',id('item'+i)]);
 const scopes=['Lectura de códigos, revisión visual y reporte de diagnóstico.','Medición de caudal y retorno en banco. Entrega de resultados por inyector.','Desarme, inspección y reparación según diagnóstico aprobado.','Desarme e inspección de discos, sellos y cuerpo de válvulas.','Montaje y verificación de tolerancias según especificación del motor.'];
 for(let i=0;i<scopes.length;i++)await client.query('UPDATE workshop."CatalogItem" SET notes=$1 WHERE id=$2 AND notes=\'\'',[scopes[i],id('service'+i)]);
 await client.query('COMMIT');console.log('Descripciones, referencias y observaciones de prueba añadidas; inventario y caja conservados.');
} catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
