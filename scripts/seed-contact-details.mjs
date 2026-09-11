import pg from 'pg';
import {createHash} from 'node:crypto';
const db = new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:56322/postgres'});
const id=key=>{const h=createHash('sha256').update('mecanismos-fixtures-v1:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
await db.connect();
try {
  await db.query('BEGIN');
  const actor = await db.query('SELECT id FROM workshop."Member" WHERE id=$1',[id('member0')]);
  if (!actor.rowCount) throw Error('Carga primero los datos locales de prueba.');
  for (let i=0;i<6;i++) await db.query('UPDATE workshop."Supplier" SET email=COALESCE(NULLIF(email,\'\'),$2), address=COALESCE(NULLIF(address,\'\'),$3) WHERE id=$1',[id('supplier'+i),`proveedor${i+1}@example.invalid`,`Calle ${12+i*3} # ${30+i}-40, Bogotá`]);
  const mappings=[['Caja oficina','Oficina'],['Cuenta bancaria del taller','Bodega'],['Caja menor bodega','Caja Menor Bodega']];
  for (const [i,[before,after]] of mappings.entries()) {
    const changed=await db.query('UPDATE workshop."MoneyAccount" SET name=$1 WHERE id=$2 AND name=$3 RETURNING id',[after,id('account'+i),before]);
    if(changed.rowCount) await db.query('INSERT INTO workshop."AuditEvent" (id,"actorId",action,"entityId",details) VALUES ($1,$2,\'ACCOUNT_RENAMED\',$3,$4::jsonb) ON CONFLICT(id) DO NOTHING',[id('account-rename-'+i),id('member0'),id('account'+i),JSON.stringify({from:before,to:after,fixture:true})]);
  }
  await db.query('INSERT INTO workshop."MoneyAccount" (id,name,"openingBalance",balance) VALUES ($1,\'Caja Menor Oficina\',0,0) ON CONFLICT DO NOTHING',[id('account3')]);
  await db.query('COMMIT');
  console.log('Contactos de ejemplo completados. Cuentas renombradas; saldos y movimientos conservados.');
} catch(error) {await db.query('ROLLBACK');throw error;} finally {await db.end();}
