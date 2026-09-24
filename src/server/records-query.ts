import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "./db";
import { getOperations } from "./operations-query";
import { getOrders } from "./workshop-query";
import type { Actor } from "./commands";
import { requirePermission, AccessDenied } from "@/domain/permissions";
import { tableColumns } from "@/domain/table-sort";
import type { OperationsView } from "@/domain/operations-view";
const sql = Prisma.sql;
const sources = {
  customers: sql`SELECT c.id::text id,concat_ws(' ',c.name,c.document,c.phone,c.email) search,to_jsonb(c)||jsonb_build_object('contact',concat_ws(' ',c.phone,c.email),'orders',(SELECT count(*) FROM workshop."WorkOrder" WHERE "customerId"=c.id)) attrs FROM workshop."Customer" c`,
  suppliers: sql`SELECT s.id::text id,concat_ws(' ',s.name,s.phone,s.email,s.address) search,to_jsonb(s)||jsonb_build_object('categoryIds',COALESCE((SELECT jsonb_agg("categoryId") FROM workshop."SupplierCategory" WHERE "supplierId"=s.id),'[]'::jsonb),'businessCategory',(SELECT string_agg(c.name,', ' ORDER BY c.name) FROM workshop."SupplierCategory" sc JOIN workshop."BusinessCategory" c ON c.id=sc."categoryId" WHERE sc."supplierId"=s.id)) attrs FROM workshop."Supplier" s`,
  members: sql`SELECT m.id::text id,concat_ws(' ',m.name,m.email,m.role) search,to_jsonb(m)||jsonb_build_object('monthlySalary',r."monthlySalary") attrs FROM workshop."Member" m LEFT JOIN LATERAL (SELECT "monthlySalary" FROM workshop."LaborRate" WHERE "memberId"=m.id AND "effectiveOn"<=(now() AT TIME ZONE 'America/Bogota')::date ORDER BY "effectiveOn" DESC LIMIT 1)r ON true`,
  items: sql`SELECT i.id::text id,concat_ws(' ',i.code,i.name,i.reference,i.brand,i.notes) search,to_jsonb(i)||jsonb_build_object('businessCategory',(SELECT name FROM workshop."BusinessCategory" WHERE id=i."businessCategoryId")) attrs FROM workshop."CatalogItem" i WHERE kind='PART'`,
  services: sql`SELECT i.id::text id,concat_ws(' ',i.code,i.name,i.reference,i.notes) search,to_jsonb(i)||jsonb_build_object('businessCategory',(SELECT name FROM workshop."BusinessCategory" WHERE id=i."businessCategoryId")) attrs FROM workshop."CatalogItem" i WHERE kind='SERVICE'`,
  balances: sql`SELECT b."itemId"||'-'||b."locationId"||'-'||b.condition::text id,concat_ws(' ',i.code,i.name,i.reference,i.notes,l.name,b.condition) search,to_jsonb(b)||jsonb_build_object('businessCategoryId',i."businessCategoryId",'item',i.name,'reference',i.reference,'purchasePrice',i."purchasePrice",'salePrice',i."salePrice",'brand',i.brand,'location',l.name,'available',b.quantity-b.reserved) attrs FROM workshop."StockBalance" b JOIN workshop."CatalogItem" i ON i.id=b."itemId" JOIN workshop."Location" l ON l.id=b."locationId"`,
  offers: sql`SELECT o.id::text id,concat_ws(' ',i.code,i.name,i.reference,i.notes,s.name,o.evidence,o."reportedStock") search,to_jsonb(o)||jsonb_build_object('businessCategoryId',i."businessCategoryId",'item',i.name,'brand',i.brand,'supplier',s.name) attrs FROM workshop."SupplierOffer" o JOIN workshop."CatalogItem" i ON i.id=o."itemId" JOIN workshop."Supplier" s ON s.id=o."supplierId"`,
  movements: sql`SELECT m.id::text id,concat_ws(' ',i.code,i.name,i.reference,i.notes,m.kind,m.reason,l.name) search,to_jsonb(m)||jsonb_build_object('businessCategoryId',i."businessCategoryId",'item',i.name,'brand',i.brand,'location',l.name,'date',m."createdAt") attrs FROM workshop."StockMovement" m JOIN workshop."CatalogItem" i ON i.id=m."itemId" JOIN workshop."Location" l ON l.id=m."locationId"`,
  accounts: sql`SELECT a.id::text id,a.name search,to_jsonb(a) attrs FROM workshop."MoneyAccount" a`,
  obligations: sql`SELECT o.id::text id,concat_ws(' ',o.title,o.category) search,to_jsonb(o)||jsonb_build_object('paid',COALESCE(p.amount,0),'pending',o.amount-COALESCE(p.amount,0),'paymentState',CASE WHEN COALESCE(p.amount,0)>=o.amount THEN 'PAID' WHEN COALESCE(p.amount,0)>0 THEN 'PARTIAL' ELSE 'PENDING' END) attrs FROM workshop."Obligation" o LEFT JOIN LATERAL(SELECT sum(CASE WHEN direction='OUT' THEN amount ELSE -amount END) amount FROM workshop."CashEntry" WHERE "obligationId"=o.id)p ON true`,
  cashEntries: sql`SELECT e.id::text id,concat_ws(' ',e.counterparty,e.reference,e.note,e.kind,a.name) search,to_jsonb(e)||jsonb_build_object('category',CASE WHEN e.kind='SALARY_ADVANCE' OR EXISTS(SELECT 1 FROM workshop."CashEntry" origin WHERE origin.id=e."reversalOfId" AND origin.kind='SALARY_ADVANCE') THEN 'PAYROLL' ELSE o.category END) attrs FROM workshop."CashEntry" e JOIN workshop."MoneyAccount" a ON a.id=e."accountId" LEFT JOIN workshop."Obligation" o ON o.id=e."obligationId"`,
  tasks: sql`SELECT t.id::text id,concat_ws(' ',t.title,t.description,'OT-'||o.number,o.title,a.names,asset.refs) search,to_jsonb(t)||jsonb_build_object('order',o.number,'members',a.names,'memberIds',a.ids) attrs FROM workshop."Task" t LEFT JOIN workshop."WorkOrder" o ON o.id=t."orderId" LEFT JOIN LATERAL(SELECT string_agg(m.name,', ' ORDER BY m.name) names,jsonb_agg(m.id) ids FROM workshop."TaskAssignment" ta JOIN workshop."Member" m ON m.id=ta."memberId" WHERE ta."taskId"=t.id)a ON true LEFT JOIN LATERAL(SELECT string_agg(concat_ws(' ',a.plate,a.serial),' ') refs FROM workshop."OrderAsset" oa JOIN workshop."Asset" a ON a.id=oa."assetId" WHERE oa."orderId"=o.id)asset ON true`,
  orders: sql`SELECT o.id::text id,concat_ws(' ','OT-'||o.number,'OT-'||lpad(o.number::text,4,'0'),o.number,o.title,o."reportedProblem",c.name,assets.refs,a.names) search,to_jsonb(o)||jsonb_build_object('businessCategory',(SELECT name FROM workshop."BusinessCategory" WHERE id=o."businessCategoryId"),'customer',COALESCE(c.name,'Mecanismos · unidad propia'),'responsible',COALESCE((SELECT name FROM workshop."Member" WHERE id=o."responsibleId"),a.names),'memberIds',a.ids,'location',l.name,'kind',COALESCE(assets.kind,'COMPONENT')) attrs FROM workshop."WorkOrder" o LEFT JOIN workshop."Customer" c ON c.id=o."customerId" JOIN workshop."Location" l ON l.id=o."locationId" LEFT JOIN LATERAL(SELECT string_agg(DISTINCT m.name,', ') names,jsonb_agg(m.id) ids FROM workshop."Member" m WHERE m.id=o."responsibleId" OR EXISTS(SELECT 1 FROM workshop."Task" t JOIN workshop."TaskAssignment" ta ON ta."taskId"=t.id WHERE t."orderId"=o.id AND t."deletedAt" IS NULL AND ta."memberId"=m.id))a ON true LEFT JOIN LATERAL(SELECT string_agg(concat_ws(' ',a.plate,a.serial),' ') refs,min(a.kind::text) kind FROM workshop."OrderAsset" oa JOIN workshop."Asset" a ON a.id=oa."assetId" WHERE oa."orderId"=o.id)assets ON true`,
};
export type RecordTable = keyof typeof sources;
export async function recordsPage(actor: Actor, params: URLSearchParams) {
  const input = z
    .object({
      table: z.enum(Object.keys(sources) as [RecordTable, ...RecordTable[]]),
      page: z.coerce.number().int().min(1).max(100000).default(1),
      size: z.coerce
        .number()
        .pipe(z.union([z.literal(10), z.literal(25), z.literal(50)]))
        .default(10),
      q: z.string().max(200).default(""),
      status: z.string().max(30).default("ALL"),
      archive: z.enum(["active", "deleted"]).default("active"),
      businessCategoryId: z
        .union([z.uuid(), z.literal("ALL"), z.literal("NONE")])
        .default("ALL"),
      brand: z.string().max(100).default("ALL"),
      location: z.string().max(120).default("ALL"),
      responsible: z.string().max(120).default("ALL"),
      kind: z.string().max(30).default("ALL"),
      period: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      min: z.coerce.number().nonnegative().optional(),
      max: z.coerce.number().nonnegative().optional(),
      orderBy: z.string().max(40).optional(),
      direction: z.enum(["asc", "desc"]).default("asc"),
    })
    .parse(Object.fromEntries(params));
  const { table } = input;
  if (actor.role === "MECHANIC" && !["orders", "tasks"].includes(table))
    throw new AccessDenied();
  if (table === "members") requirePermission(actor.role, "team:write");
  const filters: Prisma.Sql[] = [];
  const attr = (key: string) => sql`v.attrs->>${key}`;
  if (["customers", "suppliers", "tasks"].includes(table))
    filters.push(
      input.archive === "deleted" && actor.role === "ADMIN"
        ? sql`${attr("deletedAt")} IS NOT NULL`
        : sql`${attr("deletedAt")} IS NULL`,
    );
  if (actor.role === "MECHANIC")
    filters.push(
      sql`(v.attrs->'memberIds') @> ${JSON.stringify([actor.id])}::jsonb`,
    );

  for (const term of input.q
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean))
    filters.push(
      sql`lower(translate(v.search,'áéíóúÁÉÍÓÚñÑüÜ','aeiouAEIOUnNuU')) LIKE ${"%" + term + "%"}`,
    );
  if (
    input.businessCategoryId !== "ALL" &&
    [
      "items",
      "services",
      "balances",
      "offers",
      "movements",
      "orders",
      "suppliers",
    ].includes(table)
  ) {
    if (table === "suppliers")
      filters.push(
        input.businessCategoryId === "NONE"
          ? sql`jsonb_array_length(v.attrs->'categoryIds')=0`
          : sql`(v.attrs->'categoryIds') @> ${JSON.stringify([input.businessCategoryId])}::jsonb`,
      );
    else
      filters.push(
        input.businessCategoryId === "NONE"
          ? sql`${attr("businessCategoryId")} IS NULL`
          : sql`${attr("businessCategoryId")}=${input.businessCategoryId}`,
      );
  }
  if (input.brand !== "ALL") filters.push(sql`${attr("brand")}=${input.brand}`);
  if (input.location !== "ALL")
    filters.push(
      sql`(${attr("locationId")}=${input.location} OR ${attr("location")}=${input.location})`,
    );
  if (input.responsible !== "ALL")
    filters.push(
      sql`(v.attrs->'memberIds') @> ${JSON.stringify([input.responsible])}::jsonb`,
    );
  if (input.kind !== "ALL") filters.push(sql`${attr("kind")}=${input.kind}`);
  const status = input.status;
  if (status !== "ALL") {
    if (table === "balances")
      filters.push(
        status === "ZERO"
          ? sql`(${attr("available")})::numeric<=0`
          : sql`(${attr("available")})::numeric>0`,
      );
    else if (table === "members")
      filters.push(
        ["ACTIVE", "INACTIVE"].includes(status)
          ? sql`(${attr("active")})::boolean=${status === "ACTIVE"}`
          : sql`${attr("role")}=${status}`,
      );
    else if (table === "obligations")
      filters.push(sql`${attr("paymentState")}=${status}`);
    else if (table === "cashEntries")
      filters.push(
        status === "TRANSFERS"
          ? sql`${attr("transferId")} IS NOT NULL`
          : sql`${attr("direction")}=${status}`,
      );
    else if (table === "orders" && status === "OPEN")
      filters.push(sql`${attr("status")} NOT IN ('CLOSED','CANCELLED')`);
    else filters.push(sql`${attr("status")}=${status}`);
  }
  const dateField =
    table === "orders"
      ? "receivedAt"
      : table === "cashEntries"
        ? "occurredOn"
        : table === "obligations"
          ? "dueOn"
          : table === "offers"
            ? "observedAt"
            : "createdAt";
  const dateValue = ["cashEntries", "obligations", "offers"].includes(table)
    ? sql`(${attr(dateField)})::date`
    : sql`((${attr(dateField)})::timestamptz AT TIME ZONE 'America/Bogota')::date`;
  if (input.from) filters.push(sql`${dateValue}>=${input.from}::date`);
  if (input.to) filters.push(sql`${dateValue}<=${input.to}::date`);
  if (input.period && table === "obligations")
    filters.push(sql`${attr("period")}=${input.period}`);
  if (input.period && table === "cashEntries")
    filters.push(sql`left(${attr("occurredOn")},7)=${input.period}`);
  const amountField =
    table === "offers"
      ? "unitCost"
      : table === "balances"
        ? "materialCost"
        : "amount";
  if (input.min !== undefined)
    filters.push(sql`(${attr(amountField)})::numeric>=${input.min}`);
  if (input.max !== undefined)
    filters.push(sql`(${attr(amountField)})::numeric<=${input.max}`);
  const field =
    input.orderBy ??
    (table === "orders"
      ? "receivedAt"
      : table === "tasks"
        ? "createdAt"
        : ["customers", "suppliers", "members", "accounts"].includes(table)
          ? "name"
          : ["items", "services"].includes(table)
            ? "code"
            : dateField);
  if (
    input.orderBy &&
    !(tableColumns[table] as readonly (string | null)[]).includes(field)
  )
    throw new Error("Ordenamiento no válido.");
  const numeric = [
      "number",
      "order",
      "orders",
      "quantity",
      "available",
      "materialCost",
      "unitCost",
      "purchasePrice",
      "salePrice",
      "amount",
      "paid",
      "pending",
      "balance",
      "monthlySalary",
    ].includes(field),
    sort = numeric ? sql`(${attr(field)})::numeric` : sql`${attr(field)}`;
  const where = filters.length ? Prisma.join(filters, " AND ") : sql`true`,
    base = sql`FROM (${sources[table]})v WHERE ${where}`;
  const count = await db().$queryRaw<{ total: bigint }[]>(
      sql`SELECT count(*) total ${base}`,
    ),
    total = Number(count[0].total),
    page = Math.min(input.page, Math.max(1, Math.ceil(total / input.size)));
  const found = await db().$queryRaw<{ id: string }[]>(
      sql`SELECT v.id ${base} ORDER BY ${sort} ${Prisma.raw(input.direction.toUpperCase())} NULLS LAST,v.id ASC LIMIT ${input.size} OFFSET ${(page - 1) * input.size}`,
    ),
    ids = found.map((r) => r.id);
  const selectedKey = table === "services" ? "items" : table;
  const rows =
    table === "orders"
      ? await getOrders(actor, ids)
      : ((await getOperations(actor, { table: selectedKey, ids }))[
          table === "tasks" && input.archive === "deleted"
            ? "archivedTasks"
            : (selectedKey as keyof OperationsView)
        ] ?? []);
  const rowId = (r: unknown) => {
    const v = r as {
      id?: string;
      itemId?: string;
      locationId?: string;
      condition?: string;
    };
    return v.id ?? `${v.itemId}-${v.locationId}-${v.condition}`;
  };
  return {
    table,
    total,
    page,
    size: input.size,
    rows: rows.sort((a, b) => ids.indexOf(rowId(a)) - ids.indexOf(rowId(b))),
  };
}
