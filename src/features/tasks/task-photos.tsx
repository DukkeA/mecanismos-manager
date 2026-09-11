"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  snapshotKey,
  useWorkshopScope,
  assertConnected,
} from "../workshop/query";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useFormSheet } from "@/components/form-sheet";
import type { OperationsView } from "@/domain/operations-view";
import { dateLabel } from "@/components/workshop-controls";

function useTaskPhotoMutation() {
  const scope = useWorkshopScope(),
    client = useQueryClient();
  return useMutation({
    mutationKey: ["tasks", "photo"],
    mutationFn: async (form: FormData) => {
      assertConnected();
      const response = await fetch("/api/tasks/photos", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "No se pudo guardar la foto.");
      }
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: snapshotKey(scope.actorId) }),
  });
}
export function TaskPhotos({
  task,
  locked,
}: {
  task: OperationsView["tasks"][number];
  locked: boolean;
}) {
  const { demo } = useWorkshopScope(),
    draft = useFormSheet();
  const mutation = useTaskPhotoMutation(),
    requestId = useRef<string | null>(null);
  const [error, setError] = useState("");
  return (
    <section className="detail-section">
      <p>Hasta 12 fotos por tarea. JPG, PNG o WebP de máximo 3 MB.</p>
      <div className="task-photos">
        {task.photos?.map((p) => (
          <figure key={p.id}>
            <a
              href={`/api/tasks/photos?id=${p.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <Image
                unoptimized
                src={`/api/tasks/photos?id=${p.id}`}
                alt={p.caption}
                width={480}
                height={360}
                className="task-photo"
              />
            </a>
            <figcaption>
              {p.caption}
              <small className="cell-detail">
                {p.author} · {dateLabel(p.createdAt)}
              </small>
            </figcaption>
          </figure>
        ))}
      </div>
      {!task.photos?.length && <p>No hay fotos adjuntas.</p>}
      {!locked &&
        !task.deletedAt &&
        !demo &&
        (task.photos?.length ?? 0) < 12 && (
          <form
            onChange={() => {
              draft.change();
              requestId.current = null;
            }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (mutation.isPending) return;
              const element = e.currentTarget,
                form = new FormData(element);
              requestId.current ??= crypto.randomUUID();
              form.set("taskId", task.id);
              form.set("requestId", requestId.current);
              setError("");
              try {
                await mutation.mutateAsync(form);
                element.reset();
                draft.saved();
                requestId.current = null;
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "No se pudo guardar la foto.",
                );
              }
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="task-photo">Foto</FieldLabel>
                <Input
                  id="task-photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  disabled={mutation.isPending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-photo-caption">
                  Qué muestra la foto
                </FieldLabel>
                <Input
                  id="task-photo-caption"
                  name="caption"
                  required
                  maxLength={250}
                  disabled={mutation.isPending}
                />
                <FieldDescription>
                  Por ejemplo: desgaste de tobera antes de reemplazarla.
                </FieldDescription>
              </Field>
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
              <Button disabled={mutation.isPending} type="submit">
                {mutation.isPending ? "Guardando foto…" : "Adjuntar foto"}
              </Button>
            </FieldGroup>
          </form>
        )}
      {demo && (
        <p>Las fotos se pueden adjuntar al entrar con una cuenta del taller.</p>
      )}
    </section>
  );
}
