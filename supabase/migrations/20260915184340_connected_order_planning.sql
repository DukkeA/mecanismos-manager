ALTER TABLE workshop."WorkOrder" ADD COLUMN "responsibleId" uuid REFERENCES workshop."Member"(id);
CREATE INDEX work_order_responsible ON workshop."WorkOrder"("responsibleId");
-- Preserve historical task assignments; choose no arbitrary lead when several people worked on an order.
UPDATE workshop."WorkOrder" o SET "responsibleId" = a.member_id
FROM (SELECT t."orderId", (array_agg(DISTINCT ta."memberId"))[1] member_id
      FROM workshop."Task" t JOIN workshop."TaskAssignment" ta ON ta."taskId"=t.id
      WHERE t."deletedAt" IS NULL GROUP BY t."orderId" HAVING count(DISTINCT ta."memberId")=1) a
WHERE o.id=a."orderId";
