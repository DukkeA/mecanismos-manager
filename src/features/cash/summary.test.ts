import { describe, it, expect } from "vitest";
import { cashSummary } from "./summary";
import { emptyOperations, type OperationsView } from "@/domain/operations-view";
const entry = (overrides: Partial<OperationsView["cashEntries"][number]>) => ({
  id: "payment",
  accountId: "cash",
  obligationId: "rent",
  amount: "100.10",
  direction: "OUT",
  kind: "EXPENSE_PAYMENT",
  counterparty: "Arrendador",
  reference: "",
  note: "Arriendo",
  occurredOn: "2026-08-31",
  reversed: true,
  ...overrides,
});
describe("financial overview", () => {
  it("counts reversals in their posting month without erasing the original outflow", () => {
    const data = {
      ...emptyOperations,
      cashEntries: [
        entry({}),
        entry({
          id: "reversal",
          direction: "IN",
          kind: "REVERSAL",
          occurredOn: "2026-09-01",
          reversed: false,
        }),
      ],
    };
    expect(cashSummary(data, "2026-08", "2026-09-10")).toMatchObject({
      inflow: "0.00",
      outflow: "100.10",
      net: "-100.10",
    });
    expect(cashSummary(data, "2026-09", "2026-09-10")).toMatchObject({
      inflow: "100.10",
      outflow: "0.00",
      net: "100.10",
    });
  });
  it("compares unpaid obligations with actual balances and preserves partial payments", () => {
    const data = {
      ...emptyOperations,
      accounts: [{ id: "cash", name: "Caja", balance: "20.15" }],
      obligations: [
        {
          id: "rent",
          title: "Arriendo",
          category: "RENT",
          period: "2026-09",
          amount: "100.10",
          paid: "25.05",
          dueOn: "2026-09-05",
        },
      ],
    };
    const result = cashSummary(data, "2026-09", "2026-09-10");
    expect(result).toMatchObject({
      remaining: "75.05",
      shortfall: "54.90",
      available: "20.15",
    });
    expect(result.overdue).toHaveLength(1);
  });
  it("has no false coverage percentage or shortfall when there are no obligations", () => {
    expect(cashSummary(emptyOperations, "2026-09", "2026-09-10")).toMatchObject(
      {
        total: "0.00",
        paid: "0.00",
        percent: 0,
        shortfall: "0.00",
        series: [],
      },
    );
  });
});

it("distingue cuentas sin registrar de un saldo real de cero y gastos de otro mes",()=>{
 expect(cashSummary(emptyOperations,"2026-09","2026-09-10")).toMatchObject({hasAccounts:false,hasObligations:false});
 expect(cashSummary({...emptyOperations,accounts:[{id:"cash",name:"Caja",balance:"0"}],obligations:[{id:"rent",title:"Arriendo",category:"RENT",period:"2026-08",amount:"100",paid:"100",dueOn:"2026-08-05"}]},"2026-09","2026-09-10")).toMatchObject({hasAccounts:true,hasObligations:false,available:"0.00"});
});
