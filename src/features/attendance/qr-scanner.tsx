"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useAttendanceCommand } from "./hooks";
import { toast } from "sonner";
export function QrScanner({
  action,
  onDone,
}: {
  action: "IN" | "OUT";
  onDone: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    command = useAttendanceCommand(),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const submit = useRef(command.mutateAsync),
    done = useRef(onDone);
  submit.current = command.mutateAsync;
  done.current = onDone;
  useEffect(() => {
    let cancelled = false,
      handled = false,
      stop: (() => void) | undefined;
    const preview = video.current;
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices)
          throw Error(
            "Para usar la cámara en el celular, abre la app mediante HTTPS. Pide a oficina registrar la marcación si aún no está disponible.",
          );
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled || !preview) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          preview,
          async (result, _error, controls) => {
            if (!result || handled || cancelled) return;
            handled = true;
            controls.stop();
            try {
              await submit.current({
                kind: "scan",
                input: {
                  requestId: crypto.randomUUID(),
                  token: result.getText(),
                  action,
                },
              });
              if (!cancelled) {
                toast.success(
                  action === "IN"
                    ? "Entrada registrada."
                    : "Salida registrada.",
                );
                done.current();
              }
            } catch (e) {
              if (!cancelled)
                setError(
                  e instanceof Error
                    ? e.message
                    : "No se pudo registrar la marcación.",
                );
            }
          },
        );
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "No se pudo abrir la cámara.",
          );
      }
    }
    void start();
    const hidden = () => {
      if (document.hidden) {
        cancelled = true;
        stop?.();
        setError("La cámara se pausó. Pulsa Intentar de nuevo para continuar.");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelled = true;
      stop?.();
      (preview?.srcObject as MediaStream | null)
        ?.getTracks()
        .forEach((track) => track.stop());
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [action, attempt]);
  return (
    <div className="space-y-4">
      <video
        ref={video}
        muted
        playsInline
        className="aspect-square w-full rounded-lg bg-muted object-cover"
        aria-label="Cámara para escanear el QR de la sede"
      />
      <p>Apunta al código que aparece en la pantalla de la sede.</p>
      {command.isPending && (
        <p role="status">
          Registrando {action === "IN" ? "entrada" : "salida"}…
        </p>
      )}
      {error && (
        <>
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
          <Button
            variant="outline"
            onClick={() => {
              setError("");
              setAttempt((v) => v + 1);
            }}
          >
            Intentar de nuevo
          </Button>
        </>
      )}
    </div>
  );
}
