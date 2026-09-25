import "server-only";
import { Prisma } from "@/generated/prisma/client";

const sql = Prisma.sql;

// Shared by order valuation, sales, products, categories and management reports.
// Compensating entries remain in sums; reversed unknown costs no longer block a result.
export const orderCostSource = sql`
SELECT o.id, o.purpose, o.status, o."businessCategoryId", o."receivedAt", o."closedAt",
  COALESCE(mat.cost,0) material, round(COALESCE(t.cost,0),2) labor,
  COALESCE(e.cost,0) expenses, COALESCE(t.minutes,0)::int minutes,
  COALESCE(t.missing,0)::int "missingMinutes", COALESCE(mat.missing,false) "missingMaterials",
  CASE WHEN tasks.total=0 THEN 1 ELSE tasks.missing END::int "missingTasks",
  COALESCE(e.estimated,0)::int "estimatedExpenses", COALESCE(parts.missing,0)::int "unconsumedParts"
FROM workshop."WorkOrder" o
LEFT JOIN LATERAL (
  SELECT -sum(m."materialAmount") cost,
    bool_or(NOT m."costKnown" AND m.quantity<0 AND m."reversalOfId" IS NULL
      AND NOT EXISTS(SELECT 1 FROM workshop."StockMovement" r WHERE r."reversalOfId"=m.id)) missing
  FROM workshop."StockMovement" m WHERE m."orderId"=o.id
) mat ON true
LEFT JOIN LATERAL (
  SELECT sum(x.minutes) minutes, sum(x.missing) missing, sum(x.cost) cost FROM (
    SELECT e.minutes, CASE WHEN r.id IS NULL THEN e.minutes ELSE 0 END missing,
      e.minutes*r."hourlyCost"/60.0 cost
    FROM workshop."TimeEntry" e JOIN workshop."Task" task ON task.id=e."taskId"
    LEFT JOIN LATERAL(SELECT id,"hourlyCost" FROM workshop."LaborRate"
      WHERE "memberId"=e."memberId" AND "effectiveOn"<=e."workedOn" ORDER BY "effectiveOn" DESC LIMIT 1) r ON true
    WHERE task."orderId"=o.id
    UNION ALL SELECT e.minutes,0,e.pay+e."employerCost"
    FROM workshop."OvertimeEntry" e JOIN workshop."Task" task ON task.id=e."taskId"
    WHERE task."orderId"=o.id AND e."voidedAt" IS NULL
  ) x
) t ON true
LEFT JOIN LATERAL (
  SELECT count(*) total, count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM workshop."TimeEntry" e WHERE e."taskId"=task.id)
    AND NOT EXISTS(SELECT 1 FROM workshop."OvertimeEntry" e WHERE e."taskId"=task.id AND e."voidedAt" IS NULL AND e.minutes>0)) missing
  FROM workshop."Task" task WHERE task."orderId"=o.id AND task."deletedAt" IS NULL
) tasks ON true
LEFT JOIN LATERAL (
  SELECT sum(x.amount) cost, count(*) FILTER(WHERE x.estimated) estimated FROM (
    SELECT amount,estimated FROM workshop."Obligation" WHERE "orderId"=o.id
    UNION ALL SELECT CASE WHEN e.direction='OUT' THEN e.amount ELSE -e.amount END,false
    FROM workshop."CashEntry" e LEFT JOIN workshop."CashEntry" original ON original.id=e."reversalOfId"
    WHERE e."orderId"=o.id AND e."obligationId" IS NULL AND COALESCE(original.kind,e.kind)='EXPENSE_PAYMENT'
  ) x
) e ON true
LEFT JOIN LATERAL (
  SELECT count(*) missing FROM (
    SELECT l."itemId",l.condition,sum(l.quantity-COALESCE(ret.quantity,0)) quantity
    FROM workshop."SaleLine" l JOIN workshop."Sale" s ON s.id=l."saleId"
    LEFT JOIN LATERAL(SELECT sum(quantity) quantity FROM workshop."SaleReturnLine" WHERE "saleLineId"=l.id) ret ON true
    WHERE s."orderId"=o.id AND s.status='ISSUED' AND l.kind='PART' GROUP BY l."itemId",l.condition
  ) sold WHERE sold.quantity>COALESCE((SELECT -sum(m.quantity) FROM workshop."StockMovement" m
    WHERE m."orderId"=o.id AND m."itemId"=sold."itemId" AND m.condition=sold.condition),0)
) parts ON true`;

export const saleProfitSource = sql`
WITH costs AS (${orderCostSource}), warranty_work AS (
  SELECT w."saleId",w.decision,c.*,
    NOT (w.decision='REJECTED' AND EXISTS(SELECT 1 FROM workshop."Sale" billed
      WHERE billed."orderId"=w."repairOrderId" AND billed.status='ISSUED')) assumed
  FROM workshop."WarrantyCase" w JOIN costs c ON c.id=w."repairOrderId"
), warranty AS (
  SELECT "saleId",count(*)::int cases,
    COALESCE(sum(material+labor+expenses) FILTER(WHERE assumed),0) cost,
    count(*) FILTER(WHERE assumed AND (decision='PENDING' OR status NOT IN ('CLOSED','CANCELLED')
      OR "missingMinutes">0 OR "missingMaterials" OR "missingTasks">0 OR "estimatedExpenses">0))::int missing
  FROM warranty_work GROUP BY "saleId"
), base AS (
  SELECT s.id,s.number,s.title,s.kind,s."orderId",unit."orderId" "unitOrderId",s."customerId",s."issuedOn",c.name customer,
    o.status "orderStatus",s.total-COALESCE(ret.amount,0) revenue,
    CASE WHEN s."orderId" IS NOT NULL THEN o.material ELSE COALESCE(lines.material,0) END material,
    CASE WHEN s."orderId" IS NOT NULL THEN o.labor ELSE COALESCE(lines.labor,0) END labor,
    CASE WHEN s."orderId" IS NOT NULL THEN o.expenses ELSE COALESCE(lines.expenses,0) END expenses,
    COALESCE(w.cost,0) "warrantyCost",COALESCE(w.cases,0) "warrantyCases",COALESCE(w.missing,0) "warrantyPending",
    COALESCE(o."missingMinutes",0)::int "missingMinutes",COALESCE(o."missingMaterials",false) "missingMaterials",
    COALESCE(o."missingTasks",0)::int "missingTasks",COALESCE(o."unconsumedParts",0)::int "unconsumedParts",
    COALESCE(o."estimatedExpenses",0)::int "estimatedExpenses",COALESCE(lines.missing,0)::int "missingLines",
    COALESCE(paid.amount,0) collected
  FROM workshop."Sale" s JOIN workshop."Customer" c ON c.id=s."customerId"
  LEFT JOIN workshop."SerializedUnit" unit ON unit."saleId"=s.id AND s.kind='UNIT'
  LEFT JOIN costs o ON o.id=s."orderId" LEFT JOIN warranty w ON w."saleId"=s.id
  LEFT JOIN LATERAL(SELECT sum(amount) amount FROM workshop."SaleReturn" WHERE "saleId"=s.id) ret ON true
  LEFT JOIN LATERAL(SELECT sum(amount) amount FROM workshop."PaymentAllocation" WHERE "saleId"=s.id) paid ON true
  LEFT JOIN LATERAL (
    SELECT sum(l."materialCost"-COALESCE(r.cost,0)-COALESCE(l."laborCost",0)*(1-COALESCE(r.quantity,0)/l.quantity)
      -COALESCE(l."expenseCost",0)*(1-COALESCE(r.quantity,0)/l.quantity)) material,
      sum(COALESCE(l."laborCost",0)*(1-COALESCE(r.quantity,0)/l.quantity)) labor,
      sum(COALESCE(l."expenseCost",0)*(1-COALESCE(r.quantity,0)/l.quantity)) expenses,
      count(*) FILTER(WHERE l.kind='SERVICE' OR (l."materialCost" IS NULL AND l.quantity>COALESCE(r.quantity,0))) missing
    FROM workshop."SaleLine" l
    LEFT JOIN LATERAL(SELECT sum(rl.quantity) quantity,
      sum(CASE WHEN sm.id IS NOT NULL THEN sm."materialAmount" ELSE l."materialCost"*rl.quantity/l.quantity END) cost
      FROM workshop."SaleReturnLine" rl LEFT JOIN workshop."StockMovement" sm ON sm.id=rl."movementId" WHERE rl."saleLineId"=l.id) r ON true
    WHERE l."saleId"=s.id
  ) lines ON s."orderId" IS NULL
  WHERE s.status='ISSUED'
), evaluated AS (
  SELECT *,material+labor+expenses+"warrantyCost" cost,
    ("missingMinutes"=0 AND NOT "missingMaterials" AND "missingTasks"=0 AND "unconsumedParts"=0
      AND "estimatedExpenses"=0 AND "missingLines"=0 AND "warrantyPending"=0) complete
  FROM base
)
SELECT *,CASE WHEN complete THEN round(revenue-cost,2) END margin,
  GREATEST(0,revenue-collected) balance FROM evaluated`;

export const orderMarginSource = sql`
WITH costs AS (${orderCostSource}), sales AS (${saleProfitSource})
SELECT o.id,'OT-'||o.number||' · '||o.title title,COALESCE(c.name,'Reconstrucción propia') subtitle,
  o."receivedAt" date,o.status::text status,s.margin amount,
  jsonb_build_object('orderId',o.id,'saleId',s.id,'revenue',COALESCE(s.revenue,0),
    'material',cost.material,'labor',cost.labor,'expenses',cost.expenses,'minutes',cost.minutes,
    'missingMinutes',cost."missingMinutes",'missingMaterials',cost."missingMaterials",'missingTasks',cost."missingTasks",
    'unconsumedParts',cost."unconsumedParts",'estimatedExpenses',cost."estimatedExpenses",'purpose',o.purpose,
    'warrantyCost',COALESCE(s."warrantyCost",0),'warrantyPending',COALESCE(s."warrantyPending",0),
    'balance',s.balance,'collected',s.collected) data
FROM workshop."WorkOrder" o JOIN costs cost ON cost.id=o.id
LEFT JOIN workshop."Customer" c ON c.id=o."customerId" LEFT JOIN sales s ON s."orderId"=o.id`;
