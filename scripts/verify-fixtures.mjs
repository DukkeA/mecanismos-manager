import pg from 'pg';
import assert from 'node:assert/strict';
const db=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:56322/postgres'});
await db.connect();
try {
 const stock=await db.query(`SELECT b."itemId" FROM workshop."StockBalance" b LEFT JOIN workshop."StockMovement" m ON m."itemId"=b."itemId" AND m."locationId"=b."locationId" AND m.condition=b.condition GROUP BY b."itemId",b."locationId",b.condition,b.quantity,b.reserved,b."materialCost" HAVING b.quantity<>COALESCE(SUM(m.quantity),0) OR b."materialCost"<>COALESCE(SUM(m."materialAmount"),0) OR b.reserved>b.quantity`);
 assert.equal(stock.rowCount,0,'Inventario y movimientos deben coincidir');
 const cash=await db.query(`SELECT a.id FROM workshop."MoneyAccount" a LEFT JOIN workshop."CashEntry" e ON e."accountId"=a.id GROUP BY a.id HAVING a.balance<>a."openingBalance"+COALESCE(SUM(CASE WHEN e.direction='IN' THEN e.amount ELSE -e.amount END),0)`);
 assert.equal(cash.rowCount,0,'Caja debe coincidir con apertura y movimientos');
 const paid=await db.query(`SELECT o.id FROM workshop."Obligation" o LEFT JOIN workshop."CashEntry" e ON e."obligationId"=o.id GROUP BY o.id HAVING COALESCE(SUM(CASE WHEN e.direction='OUT' THEN e.amount ELSE -e.amount END),0)>o.amount`);
 assert.equal(paid.rowCount,0,'Un abono no puede superar el gasto');
 const {rows}=await db.query(`SELECT (SELECT count(*) FROM workshop."WorkOrder")::int AS orders,(SELECT count(*) FROM workshop."Task")::int AS tasks,(SELECT count(*) FROM workshop."SupplierOffer")::int AS offers,(SELECT count(*) FROM workshop."Member" WHERE "authSubject" IS NOT NULL AND email LIKE '%@taller.example.invalid')::int AS local_accesses`);
 assert.ok(rows[0].orders>=24);assert.ok(rows[0].tasks>=52);assert.ok(rows[0].offers>=36);assert.equal(rows[0].local_accesses,3);
 console.log('Datos verificados:',JSON.stringify(rows[0]),'Inventario, caja y abonos conciliados.');
}finally{await db.end();}
