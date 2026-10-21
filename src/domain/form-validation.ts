import { z } from "zod";

export type FormField = {
  key: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "time"
    | "date"
    | "textarea"
    | "select"
    | "category"
    | "categories"
    | "sale"
    | "members"
    | "money"
    | "quantity";
  customerId?: string;
  options?: { id: string; label: string }[];
  optional?: boolean;
  hint?: string;
  allowZero?: boolean;
  minLength?: number;
  maxLength?: number;
};

// Accept only the explicit decimal format used by the ledger. Never guess a monetary value.
export function validateForm(
  fields: FormField[],
  values: Record<string, unknown>,
) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    if (field.type === "members" || field.type === "categories") {
      const list = z.array(z.string());
      shape[field.key] = field.optional
        ? list.optional()
        : list.min(1, "Selecciona al menos una opción.");
      continue;
    }
    shape[field.key] = z.preprocess(
      (v) => String(v ?? "").trim(),
      z.string().superRefine((value, ctx) => {
        const issue = (message: string) =>
          ctx.addIssue({ code: "custom", message });
        if (!value) {
          if (!field.optional)
            issue(
              field.type === "select" || field.type === "category"
                ? "Selecciona una opción."
                : field.type === "date"
                  ? "Selecciona una fecha."
                  : "Completa este campo.",
            );
          return;
        }
        if (field.minLength && value.length < field.minLength)
          issue(`Escribe al menos ${field.minLength} caracteres.`);
        if (field.maxLength && value.length > field.maxLength)
          issue(`Usa como máximo ${field.maxLength} caracteres.`);
        if (field.type === "money" || field.type === "quantity") {
          const format =
            field.type === "money"
              ? /^\d{1,12}(\.\d{1,2})?$/
              : /^\d{1,10}(\.\d{1,3})?$/;
          if (!z.string().regex(format).safeParse(value).success)
            issue(
              field.type === "money"
                ? "Usa números sin separadores de miles. Ej. 250000 o 250000.50."
                : "Usa una cantidad sin separadores de miles y hasta tres decimales. Ej. 1.5.",
            );
          else if (!field.allowZero && Number(value) === 0)
            issue("El valor debe ser mayor que cero.");
        }
        if (
          field.type === "time" &&
          !z.iso.time({ precision: -1 }).safeParse(value).success
        )
          issue("Escribe una hora válida.");
        if (field.type === "date" && !z.iso.date().safeParse(value).success)
          issue("Selecciona una fecha válida.");
        if (field.type === "email" && !z.email().safeParse(value).success)
          issue("Escribe un correo completo. Ej. nombre@empresa.com.");
        if (
          field.type === "select" &&
          field.options &&
          !field.options.some((o) => o.id === value)
        )
          issue("Selecciona una opción válida.");
        if (
          field.key === "period" &&
          !z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .safeParse(value).success
        )
          issue("Escribe el año y el mes. Ej. 2026-09.");
        if (
          ["plannedMinutes", "minutes"].includes(field.key) &&
          !z.coerce
            .number()
            .int()
            .min(1)
            .max(field.key === "minutes" ? 1440 : 43200)
            .safeParse(value).success
        )
          issue("Escribe minutos enteros dentro del rango permitido.");
      }),
    );
  }
  const parsed = z.object(shape).safeParse(values);
  return parsed.success ? {} : zodFieldErrors(parsed.error);
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !errors[key]) errors[key] = zodIssueMessage(issue);
  }
  return errors;
}

export function zodIssueMessage(issue: z.core.$ZodIssue): string {
  if (!/^(Invalid|Too|Unrecognized)/.test(issue.message)) return issue.message;
  if (issue.code === "too_small")
    return `El valor mínimo es ${issue.minimum}${issue.origin === "string" ? " caracteres" : ""}.`;
  if (issue.code === "too_big")
    return `El valor máximo es ${issue.maximum}${issue.origin === "string" ? " caracteres" : ""}.`;
  return "Revisa el formato o selecciona una opción válida.";
}

export function zodErrorMessage(error: z.ZodError): string {
  const labels: Record<string, string> = {
    name: "Nombre",
    email: "Correo",
    title: "Descripción",
    customerId: "Cliente",
    itemId: "Repuesto o servicio",
    memberId: "Empleado",
    memberIds: "Equipo asignado",
    assignedMemberId: "Mecánico",
    description: "Detalle",
    quantity: "Cantidad",
    initialQuantity: "Cantidad inicial",
    unitPrice: "Precio unitario",
    unitCost: "Costo unitario",
    discount: "Descuento",
    amount: "Importe",
    accountId: "Cuenta",
    locationId: "Sede",
    dueOn: "Vencimiento",
    occurredOn: "Fecha",
    workedOn: "Día trabajado",
    plannedMinutes: "Minutos previstos",
    minutes: "Minutos",
    note: "Detalles",
    monthlySalary: "Salario",
    monthlyHours: "Horas mensuales",
    effectiveOn: "Fecha de vigencia",
  };
  return error.issues
    .map((issue) => {
      const line =
        issue.path[0] === "lines" && typeof issue.path[1] === "number"
          ? `Línea ${issue.path[1] + 1} · `
          : "";
      const label = labels[String(issue.path.at(-1))];
      return `${line}${label ? `${label}: ` : ""}${zodIssueMessage(issue)}`;
    })
    .join(" ");
}
