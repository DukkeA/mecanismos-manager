export type ChangeStamp = { id: string; author: string; at: string };
export type ActivityChange = ChangeStamp & {
  subject: string;
  entityId: string;
  entityType: string;
  operation: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};
export const entityLabels: Record<string, string> = {
  Member: "Empleado",
  LaborRate: "Salario",
  OvertimeEntry: "Bono u horas extra",
  EmployeeLeave: "Permiso",
  VacationAdjustment: "Vacaciones",
  SalaryAdvance: "Anticipo de salario",
  AdvanceInstallment: "Cuota de anticipo",
  AttendanceShift: "Asistencia",
  MoneyAccount: "Cuenta",
  CashEntry: "Movimiento de dinero",
  Obligation: "Gasto por pagar",
  RecurringExpense: "Gasto recurrente",
  CashClosure: "Cierre de caja",
  PayrollPayment: "Pago de salario",
  CustomerPayment: "Cobro de cliente",
  PaymentAllocation: "Asignación de abono",
  SupplierPayment: "Pago a proveedor",
};
export type NotificationPage = {
  unread: number;
  total: number;
  rows: {
    id: string;
    batchId: string;
    readAt: string | null;
    at: string;
    author: string;
    title: string;
    count: number;
  }[];
};
