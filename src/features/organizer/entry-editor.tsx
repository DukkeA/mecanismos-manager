"use client";
import { useState } from "react";
import { useOrganizerCommand } from "./hooks";
import {
  organizerDateTime,
  bogotaDate,
  type OrganizerItem,
} from "@/domain/organizer";
import type { OrderView } from "@/domain/workshop-view";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Choice, DateField } from "@/components/workshop-controls";
import { useFormSheet } from "@/components/form-sheet";
import dynamic from "next/dynamic";
import { notePlainText, type NoteNode } from "@/domain/note-content";
const NoteEditor = dynamic(
  () => import("./note-editor").then((m) => m.NoteEditor),
  { ssr: false },
);
export type EntryDraft = Partial<OrganizerItem> &
  Pick<OrganizerItem, "kind" | "visibility">;
const timeOf = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-GB", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "08:30";
export function EntryEditor({
  entry,
  orders,
  onSaved,
}: {
  entry: EntryDraft;
  orders: OrderView[];
  onSaved: () => void;
}) {
  const command = useOrganizerCommand(),
    draft = useFormSheet();
  const [calendar, setCalendar] = useState(
    entry.kind === "EVENT" || !!entry.calendar,
  );
  const [error, setError] = useState("");
  const [richContent, setRichContent] = useState<NoteNode | null>(
    entry.richContent ?? null,
  );
  const [imageBusy, setImageBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return (
    <form
      className="sheet-body"
      onChange={() => setRequestId(crypto.randomUUID())}
      onSubmit={async (e) => {
        e.preventDefault();
        if (imageBusy || command.isPending) return;
        const form = new FormData(e.currentTarget);
        setError("");
        try {
          await command.mutateAsync({
            kind: "save",
            input: {
              ...entry,
              requestId,
              title: form.get("title"),
              body:
                entry.kind === "NOTE"
                  ? richContent
                    ? notePlainText(richContent)
                    : (entry.body ?? "")
                  : form.get("body"),
              richContent: entry.kind === "NOTE" ? richContent : null,
              priority: form.get("priority"),
              calendar,
              startsAt: organizerDateTime(
                String(form.get("date") ?? ""),
                String(form.get("time") ?? "08:30"),
              ),
              endsAt:
                entry.kind === "EVENT"
                  ? organizerDateTime(
                      String(form.get("endDate") ?? ""),
                      String(form.get("endTime") ?? ""),
                    )
                  : null,
              orderId:
                String(form.get("orderId") ?? "").replace("__none", "") || null,
            },
          });
          draft.saved();
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo guardar.");
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="entry-title">Título</FieldLabel>
          <Input
            id="entry-title"
            name="title"
            required
            minLength={3}
            maxLength={200}
            defaultValue={entry.title}
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="entry-body">
            {entry.kind === "NOTE" ? "Nota" : "Detalles"}
          </FieldLabel>
          {entry.kind === "NOTE" ? (
            <NoteEditor
              content={entry.richContent}
              text={entry.body ?? ""}
              onBusy={setImageBusy}
              onChange={(content) => {
                setRichContent(content);
                draft.change();
                setRequestId(crypto.randomUUID());
              }}
            />
          ) : (
            <Textarea
              id="entry-body"
              name="body"
              maxLength={10000}
              rows={7}
              defaultValue={entry.body}
            />
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="entry-priority">Prioridad</FieldLabel>
          <Choice
            id="entry-priority"
            name="priority"
            defaultValue={entry.priority ?? "NORMAL"}
            options={[
              { id: "NORMAL", label: "Normal" },
              { id: "HIGH", label: "Alta" },
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="entry-order">
            Orden relacionada (opcional)
          </FieldLabel>
          <Choice
            id="entry-order"
            name="orderId"
            defaultValue={entry.orderId ?? ""}
            options={[
              { id: "", label: "Sin orden" },
              ...orders.map((o) => ({
                id: o.id,
                label: `OT-${o.number} · ${o.title}`,
              })),
            ]}
          />
        </Field>
        {entry.kind !== "NOTE" && (
          <>
            {entry.kind === "TODO" && (
              <Field orientation="horizontal">
                <Checkbox
                  id="entry-calendar"
                  checked={calendar}
                  onCheckedChange={(checked) => {
                    setCalendar(!!checked);
                    draft.change();
                    setRequestId(crypto.randomUUID());
                  }}
                />
                <FieldLabel htmlFor="entry-calendar">
                  Añadir a calendario
                </FieldLabel>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="entry-date">
                {entry.kind === "EVENT" ? "Fecha de inicio" : "Fecha límite"}
                {!calendar && " (opcional)"}
              </FieldLabel>
              <DateField
                id="entry-date"
                name="date"
                required={calendar}
                defaultValue={entry.startsAt ? bogotaDate(entry.startsAt) : ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="entry-time">Hora (Bogotá)</FieldLabel>
              <Input
                id="entry-time"
                name="time"
                type="time"
                required={calendar}
                defaultValue={timeOf(entry.startsAt)}
              />
            </Field>
            {entry.kind === "EVENT" && (
              <>
                <Field>
                  <FieldLabel htmlFor="entry-end">
                    Fecha de finalización (opcional)
                  </FieldLabel>
                  <DateField
                    id="entry-end"
                    name="endDate"
                    defaultValue={entry.endsAt ? bogotaDate(entry.endsAt) : ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="entry-end-time">
                    Hora de finalización
                  </FieldLabel>
                  <Input
                    id="entry-end-time"
                    type="time"
                    name="endTime"
                    defaultValue={timeOf(entry.endsAt)}
                  />
                </Field>
              </>
            )}
          </>
        )}
        <FieldDescription>
          {entry.visibility === "PERSONAL"
            ? "Solo tú puedes ver este registro."
            : "Visible para administración y oficina."}
        </FieldDescription>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            disabled={command.isPending}
            onClick={draft.cancel}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={command.isPending || imageBusy}>
            {command.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
