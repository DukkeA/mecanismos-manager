import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "../src/server/db";
import {
  recordPayroll,
  reversePayroll,
  adoptSalaryObligation,
  syncSalaryObligations,
} from "../src/server/payroll-service";
import { payrollPreview } from "../src/server/employee-benefits-query";
import { saveRecurring } from "../src/server/financial-control";
import { recordOvertime } from "../src/server/team-service";
import { serializable, setActor } from "../src/server/commands";
const id = (key: string) => {
  const h = createHash("sha256")
    .update(`local-payroll-v1-${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const period = "2026-09",
  date = "2026-09-12";
const members = await db().member.findMany({
  where: { email: { endsWith: "@taller.example.invalid" } },
});
const adminMember = members.find(
    (m) => m.email === "persona1@taller.example.invalid",
  ),
  officeMember = members.find(
    (m) => m.email === "persona4@taller.example.invalid",
  );
if (!adminMember || !officeMember)
  throw new Error("Primero carga los empleados ficticios del taller.");
const admin = { id: adminMember.id, role: "ADMIN" as const },
  office = { id: officeMember.id, role: "OFFICE" as const };
const account = await db().moneyAccount.findUniqueOrThrow({
  where: { name: "Bodega" },
});
const original = await db().obligation.findFirst({
  where: { period, title: "Salarios primera quincena" },
});
if (
  original &&
  !(await db().obligation.findUnique({ where: { salaryPeriod: period } }))
)
  await adoptSalaryObligation(admin, {
    requestId: id("adopt"),
    period,
    obligationId: original.id,
  });
let preview = await payrollPreview(admin, period);
for (const entry of preview.unassigned ?? []) {
  const selection = [];
  let available = new Decimal(entry.amount);
  for (const name of ["Camilo Ríos", "Diana Pardo", "Diego Beltrán"]) {
    const row = preview.rows.find((r) => r.name === name);
    if (!row || Number(row.remaining) <= 0 || available.lte(0)) continue;
    const amount = Decimal.min(available, row.remaining!);
    selection.push({
      memberId: row.memberId,
      amount: amount.toFixed(2),
      fingerprint: row.fingerprint,
    });
    available = available.minus(amount);
  }
  if (available.gt(0))
    throw new Error(
      "Revisa el pago de muestra anterior: no alcanza la selección para asignarlo.",
    );
  await recordPayroll(office, {
    requestId: id(`assign-${entry.id}`),
    period,
    accountId: entry.accountId,
    occurredOn: entry.occurredOn,
    existingEntryId: entry.id,
    note: "Pago de primera quincena a Camilo, Diana y Diego",
    rows: selection,
  });
}
async function payment(key: string, name: string, amount?: string) {
  if (await db().commandReceipt.findUnique({ where: { id: id(key) } })) return;
  const row = (await payrollPreview(admin, period)).rows.find(
    (r) => r.name === name,
  )!;
  if (!row || Number(row.remaining) <= 0) return;
  await recordPayroll(office, {
    requestId: id(key),
    period,
    accountId: account.id,
    occurredOn: date,
    note: amount
      ? "Abono de primera quincena. Saldo restante al cierre del mes."
      : "Pago del saldo del mes, descontando los permisos y anticipos acordados.",
    rows: [
      {
        memberId: row.memberId,
        amount: amount ?? row.remaining,
        fingerprint: row.fingerprint,
      },
    ],
  });
}
await payment("luis-partial", "Luis Cárdenas", "350000");
await payment("diana-full", "Diana Pardo");
await payment("felipe-reversal", "Felipe Lozano", "100000");
if (
  !(await db().commandReceipt.findUnique({
    where: { id: id("reverse-felipe") },
  }))
) {
  const row = (await payrollPreview(admin, period)).rows.find(
    (r) => r.name === "Felipe Lozano",
  )!;
  const paid = row.payments.find(
    (p) => Number(p.amount) === 100000 && !p.reversed,
  );
  if (paid)
    await reversePayroll(admin, {
      requestId: id("reverse-felipe"),
      entryId: paid.entryId,
      occurredOn: date,
      reason:
        "Transferencia devuelta por el banco. El salario continúa pendiente.",
    });
}
const hector = members.find((m) => m.name === "Héctor Moreno")!;
await recordOvertime(office, {
  requestId: id("bonus-hector"),
  memberId: hector.id,
  workedOn: "2026-09-11",
  kind: "FIXED",
  minutes: 0,
  surchargePercent: 0,
  pay: "35000",
  employerCost: "0",
  note: "Apoyo en la entrega de la bomba del camión de Transportes Sierra",
});
const combined = await db().recurringExpense.findFirst({
  where: { title: "Salarios y prestaciones del equipo" },
});
if (combined) {
  await saveRecurring(office, {
    requestId: id("separate-contributions"),
    id: combined.id,
    title: "Aportes y prestaciones del equipo",
    category: "PAYROLL",
    amount: "4200000",
    dueDay: 30,
    active: true,
  });
  await serializable(async (tx) => {
    await setActor(tx, office);
    await tx.obligation.updateMany({
      where: { recurringId: combined.id, entries: { none: {} } },
      data: { title: "Aportes y prestaciones del equipo", amount: "4200000" },
    });
  });
}
await serializable(async (tx) => {
  await setActor(tx, admin);
  await syncSalaryObligations(tx);
});
preview = await payrollPreview(admin, period);
console.log(
  JSON.stringify({
    period,
    paid: preview.rows.filter(
      (r) => Number(r.payable) > 0 && Number(r.remaining) === 0,
    ).length,
    partial: preview.rows.filter(
      (r) => Number(r.paid) > 0 && Number(r.remaining) > 0,
    ).length,
    pending: preview.rows.filter(
      (r) => Number(r.paid) === 0 && Number(r.remaining) > 0,
    ).length,
    unassigned: preview.unassigned?.length,
  }),
);
await db().$disconnect();
