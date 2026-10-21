"use client";
import { useState, type ComponentProps, type SubmitEvent } from "react";
import { z } from "zod";
import { validateForm, type FormField } from "@/domain/form-validation";
import { FormValidationContext } from "./form-validation-context";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

// All form controls use Zod, including shadcn controls whose submitted value is hidden.
export function ValidatedForm({
  children,
  onSubmit,
  onReset,
  ...props
}: ComponentProps<"form">) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  function submit(event: SubmitEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const invalid: Record<string, string> = {};
    const labels: Record<string, string> = {};
    const controls = form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
    >(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, [data-validation-value], button[role=combobox]",
    );
    for (const control of controls) {
      if (
        control.disabled ||
        control.getAttribute("data-validation-disabled") === "true" ||
        control.hasAttribute("readonly")
      )
        continue;
      const key = control.id || control.getAttribute("name");
      if (!key) continue;
      const required =
        control.hasAttribute("required") ||
        control.getAttribute("aria-required") === "true" ||
        control.getAttribute("data-validation-required") === "true";
      const value =
        control.getAttribute("data-validation-value") ??
        (control instanceof HTMLButtonElement
          ? control.getAttribute("data-placeholder") !== null
            ? ""
            : (control.textContent ?? "")
          : control.value);
      const type =
        control.getAttribute("data-validation-type") ??
        control.getAttribute("type");
      const field: FormField = {
        key,
        label: key,
        optional: !required,
        type:
          type === "email"
            ? "email"
            : type === "date"
              ? "date"
              : type === "time"
                ? "time"
                : control.getAttribute("inputmode") === "decimal"
                  ? /qty|quantity|hours/.test(key)
                    ? "quantity"
                    : "money"
                  : "text",
        allowZero: !/qty|quantity|hours/.test(key),
        minLength: Number(control.getAttribute("minlength")) || undefined,
        maxLength: Number(control.getAttribute("maxlength")) || undefined,
      };
      Object.assign(
        invalid,
        validateForm([field], { [key]: value === "__none" ? "" : value }),
      );
      if (type === "file" && control instanceof HTMLInputElement) {
        const schema = z
          .file({ error: "Selecciona un archivo." })
          .min(1, "El archivo está vacío.");
        const parsed = (required ? schema : schema.optional()).safeParse(
          control.files?.[0],
        );
        if (!parsed.success) invalid[key] = parsed.error.issues[0].message;
      }
      if (type === "number" && value.trim()) {
        let schema = z.coerce
          .number({ error: "Escribe un número válido." })
          .finite();
        const min = control.getAttribute("min"),
          max = control.getAttribute("max"),
          step = control.getAttribute("step");
        if (min !== null)
          schema = schema.min(Number(min), `El valor mínimo es ${min}.`);
        if (max !== null)
          schema = schema.max(Number(max), `El valor máximo es ${max}.`);
        if (!step || step === "1") schema = schema.int("Usa un número entero.");
        const parsed = schema.safeParse(value);
        if (!parsed.success) invalid[key] = parsed.error.issues[0].message;
      }
      labels[key] =
        Array.from(form.querySelectorAll("label"))
          .find((label) => label.htmlFor === key)
          ?.textContent?.trim() ||
        control.getAttribute("aria-label") ||
        key;
      control.setAttribute("aria-invalid", String(!!invalid[key]));
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      event.preventDefault();
      event.stopPropagation();
      const first = form.querySelector<HTMLElement>(
        `[id="${CSS.escape(Object.keys(invalid)[0])}"]`,
      );
      (first?.dataset.focusId
        ? document.getElementById(first.dataset.focusId)
        : first
      )?.focus();
      first?.scrollIntoView({ block: "nearest" });
      setErrors(
        Object.fromEntries(
          Object.entries(invalid).map(([key, message]) => [
            key,
            `${labels[key]}: ${message}`,
          ]),
        ),
      );
      return;
    }
    onSubmit?.(event);
  }
  return (
    <FormValidationContext.Provider value={errors}>
      <form
        {...props}
        noValidate
        onSubmit={submit}
        onReset={(event) => {
          setErrors({});
          onReset?.(event);
        }}
      >
        {Object.keys(errors).length > 0 && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Revisa los campos señalados</AlertTitle>
            <AlertDescription>
              <ul>
                {Object.entries(errors).map(([key, message]) => (
                  <li key={key}>
                    <a href={`#${key}`}>{message}</a>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {children}
      </form>
    </FormValidationContext.Provider>
  );
}
