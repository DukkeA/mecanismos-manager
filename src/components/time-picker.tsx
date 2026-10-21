"use client";
import { useId, useState } from "react";
import { Choice } from "./workshop-controls";
import { useFormSheet } from "./form-sheet";

// A minute-precise clock built from the same shadcn Select as the other fields.
export function TimeField({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  required = false,
  label = "Hora",
  disabled = false,
  ...aria
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const draft = useFormSheet();
  const [local, setLocal] = useState(defaultValue);
  const current = value ?? local;
  const [hour, minute] = current.split(":");
  function change(next: string) {
    draft.change();
    setLocal(next);
    onChange?.(next);
  }
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <input type="hidden" name={name} value={current} disabled={disabled} />
      <Choice
        {...aria}
        id={controlId}
        label={`${label}: hora`}
        validation={{ value: current, type: "time", required }}
        disabled={disabled}
        required={required}
        value={hour ?? ""}
        onChange={(next) => change(next ? `${next}:${minute || "00"}` : "")}
        options={[
          { id: "", label: "Hora" },
          ...Array.from({ length: 24 }, (_, h) => ({
            id: String(h).padStart(2, "0"),
            label: String(h).padStart(2, "0"),
          })),
        ]}
      />
      <span aria-hidden="true">:</span>
      <Choice
        {...aria}
        id={`${controlId}-minutes`}
        label={`${label}: minutos`}
        disabled={disabled}
        required={required}
        value={minute ?? ""}
        onChange={(next) => change(next ? `${hour || "00"}:${next}` : "")}
        options={[
          { id: "", label: "Min" },
          ...Array.from({ length: 60 }, (_, m) => ({
            id: String(m).padStart(2, "0"),
            label: String(m).padStart(2, "0"),
          })),
        ]}
      />
    </div>
  );
}
