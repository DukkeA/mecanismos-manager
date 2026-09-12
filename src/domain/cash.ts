export const cashKinds = {
  CUSTOMER_PAYMENT: { label: "Cobro a cliente", direction: "IN" },
  CUSTOMER_ADVANCE: { label: "Anticipo de cliente", direction: "IN" },
  EXPENSE_PAYMENT: { label: "Pago de gasto u obligación", direction: "OUT" },
  SUPPLIER_PAYMENT: { label: "Pago a proveedor", direction: "OUT" },
  OWNER_CONTRIBUTION: { label: "Aporte de propietario", direction: "IN" },
  OWNER_WITHDRAWAL: { label: "Retiro de propietario", direction: "OUT" },
  LOAN_RECEIVED: { label: "Préstamo recibido", direction: "IN" },
  LOAN_PAYMENT: { label: "Pago de préstamo", direction: "OUT" },
  CUSTOMER_REFUND: { label: "Devolución a cliente", direction: "OUT" },
} as const;
export const obligationCategories = {
  RENT: "Arriendo",
  UTILITIES: "Servicios públicos",
  PAYROLL: "Aportes y prestaciones",
  OTHER: "Otros gastos",
} as const;
