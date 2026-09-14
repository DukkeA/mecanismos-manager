"use client";
import { Paperclip as EmptyPaperclip } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkshopScope, assertConnected } from "@/features/workshop/query";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { FileText, Upload } from "lucide-react";
import { dateLabel } from "@/components/workshop-controls";
export function Attachments({
  entityType,
  entityId,
}: {
  entityType: "ORDER" | "SALE" | "PURCHASE" | "WARRANTY";
  entityId: string;
}) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    { actorId } = useWorkshopScope(),
    client = useQueryClient(),
    key = ["attachments", actorId, entityType, entityId];
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const r = await fetch(
        `/api/attachments?${new URLSearchParams({ entityType, entityId })}`,
        { signal, cache: "no-store" },
      );
      if (!r.ok) throw new Error("No se pudieron consultar los adjuntos.");
      return r.json() as Promise<
        { id: string; name: string; bytes: number; createdAt: string }[]
      >;
    },
  });
  const upload = useMutation({
    mutationFn: async (data: FormData) => {
      assertConnected();
      data.set("entityType", entityType);
      data.set("entityId", entityId);
      data.set("requestId", requestId);
      const r = await fetch("/api/attachments", { method: "POST", body: data }),
        body = await r.json();
      if (!r.ok) throw new Error(body.error);
    },
    onSuccess: async () => {
      setRequestId(crypto.randomUUID());
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h3 className="font-semibold">Fotos y documentos</h3>
      {query.isPending && <p role="status">Consultando adjuntos…</p>}
      {query.isSuccess && query.data.length === 0 && (
        <DataEmpty
          icon={EmptyPaperclip}
          compact
          title="Sin archivos adjuntos"
          description="Añade fotografías o documentos relacionados con este registro."
        />
      )}
      {query.data?.map((a) => (
        <div key={a.id} className="flex items-center gap-3">
          <FileText className="size-4 shrink-0" />
          <div>
            <a
              className="text-sm underline underline-offset-4"
              href={`/api/attachments?id=${a.id}`}
            >
              {a.name}
            </a>
            <p className="text-xs text-muted-foreground">
              {Math.ceil(a.bytes / 1024)} KB · {dateLabel(a.createdAt)}
            </p>
          </div>
        </div>
      ))}
      {query.isError && (
        <p className="text-sm text-destructive">{query.error.message}</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (upload.isPending) return;
          const form = e.currentTarget;
          try {
            await upload.mutateAsync(new FormData(form));
            form.reset();
          } catch {
            /* Render mutation error below. */
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`attachment-name-${entityId}`}>
              Descripción del archivo
            </FieldLabel>
            <Input
              id={`attachment-name-${entityId}`}
              name="name"
              placeholder="Ej. Autorización de reparación"
              required
              maxLength={250}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`attachment-file-${entityId}`}>
              PDF o imagen · hasta 3 MB
            </FieldLabel>
            <Input
              id={`attachment-file-${entityId}`}
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              required
            />
          </Field>
          <Button variant="outline" disabled={upload.isPending}>
            <Upload />
            {upload.isPending ? "Subiendo…" : "Adjuntar archivo"}
          </Button>
        </FieldGroup>
      </form>
      {upload.isError && (
        <Alert variant="destructive">
          <AlertTitle>{upload.error.message}</AlertTitle>
        </Alert>
      )}
    </section>
  );
}
