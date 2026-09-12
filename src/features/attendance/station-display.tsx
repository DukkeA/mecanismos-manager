"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { useStationCode, useAttendanceCommand } from "./hooks";
export function StationDisplay({
  locationId,
  name,
}: {
  locationId: string;
  name: string;
}) {
  const code = useStationCode(locationId),
    command = useAttendanceCommand(),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  // Expiry follows elapsed time since the server response, even if the display's clock is wrong.
  const remaining = code.data
    ? Math.max(
        0,
        Math.ceil(
          (code.data.expiresAt -
            code.data.serverNow -
            (now - code.dataUpdatedAt)) /
            1000,
        ),
      )
    : 0;
  return (
    <div className="space-y-4 text-center">
      <h3 className="text-xl font-semibold">{name}</h3>
      <p>Escanea desde Mi jornada para registrar tu entrada o salida.</p>
      {code.data && remaining > 0 && !code.isError ? (
        <>
          <div className="mx-auto w-fit rounded-xl bg-white p-5">
            <QRCodeSVG
              value={code.data.token}
              size={240}
              marginSize={4}
              title={`Código de asistencia de ${name}`}
            />
          </div>
          <p className="tabular-nums">Cambia en {remaining} segundos</p>
        </>
      ) : (
        <div className="grid min-h-72 place-content-center bg-muted p-5">
          <p>{code.isError ? code.error.message : "Actualizando código…"}</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Mantén esta pantalla en la sede, en un equipo bajo supervisión. Una foto
        deja de servir al vencer el código.
      </p>
      {code.isError && (
        <Button
          disabled={command.isPending}
          onClick={async () => {
            try {
              await command.mutateAsync({
                kind: "station",
                input: {
                  requestId: crypto.randomUUID(),
                  locationId,
                  active: true,
                },
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo activar.");
            }
          }}
        >
          Activar pantalla
        </Button>
      )}
      {code.data && !code.isError && (
        <Button
          variant="outline"
          disabled={command.isPending}
          onClick={async () => {
            try {
              await command.mutateAsync({
                kind: "station",
                input: {
                  requestId: crypto.randomUUID(),
                  locationId,
                  active: false,
                },
              });
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "No se pudo desactivar.",
              );
            }
          }}
        >
          Desactivar código de la sede
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
