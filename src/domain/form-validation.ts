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
    | "sale"
    | "members"
    | "money"
    | "quantity";
  customerId?: string;
  options?: { id: string; label: string }[];
  optional?: boolean;
  hint?: string;
  allowZero?: boolean;
};

// Accept only the explicit decimal format used by the ledger. Never guess a monetary value.
export function validateForm(
  fields: FormField[],
  values: Record<string, unknown>,
) {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (field.type === "members") {
      if (!field.optional && (!Array.isArray(raw) || raw.length === 0))
        errors[field.key] = "Selecciona al menos una opción.";
      continue;
    }
    const value = String(raw ?? "").trim();
    if (!value) {
      if (!field.optional)
        errors[field.key] =
          field.type === "select"
            ? "Selecciona una opción."
            : field.type === "date"
              ? "Selecciona una fecha."
              : "Completa este campo.";
      continue;
    }
    if (field.type === "money" || field.type === "quantity") {
      const format =
        field.type === "money"
          ? /^\d{1,12}(\.\d{1,2})?$/
          : /^\d{1,10}(\.\d{1,3})?$/;
      if (!format.test(value))
        errors[field.key] =
          field.type === "money"
            ? "Usa números sin separadores de miles. Ej. 250000 o 250000.50."
            : "Usa una cantidad sin separadores de miles y hasta tres decimales. Ej. 1.5.";
      else if (!field.allowZero && Number(value) === 0)
        errors[field.key] = "El valor debe ser mayor que cero.";
    }
    if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
      errors[field.key] = "Escribe una hora válida.";
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      errors[field.key] = "Escribe un correo completo. Ej. nombre@empresa.com.";
    if (field.key === "period" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      errors[field.key] = "Escribe el año y el mes. Ej. 2026-09.";
  }
  return errors;
}
