"use client";
import { useEffect, useState, useRef } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
type Code = {
  token: string;
  name: string;
  expiresAt: number;
  serverNow: number;
};
function useDisplayCode(enabled: boolean) {
  return useQuery({
    queryKey: ["station-display"],
    enabled,
    retry: false,
    refetchInterval: 3000,
    queryFn: async ({ signal }): Promise<Code> => {
      const response = await fetch("/api/attendance-station", {
        signal,
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      return body;
    },
  });
}
function usePairDisplay() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch("/api/attendance-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["station-display"] }),
  });
}
function Display() {
  const [token, setToken] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [now, setNow] = useState(Date.now());
  const pair = usePairDisplay(),
    code = useDisplayCode(ready && !token);
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const value = new URLSearchParams(window.location.hash.slice(1)).get(
        "pair",
      );
      setToken(value);
      window.history.replaceState(null, "", window.location.pathname);
      setReady(true);
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  // Measure elapsed time locally; do not trust the tablet's wall clock.
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
    <main className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <BrandLogo className="w-56" />
      <h1 className="text-3xl font-semibold">
        {code.data?.name ?? "Asistencia del taller"}
      </h1>
      {token ? (
        <>
          <p>
            Vincula esta tablet o celular para mostrar el código de la sede. La
            pantalla solo tendrá acceso al QR.
          </p>
          <Button
            disabled={pair.isPending}
            onClick={async () => {
              try {
                await pair.mutateAsync(token);
                setToken(null);
              } catch {
                /* The mutation displays the error below. */
              }
            }}
          >
            Vincular esta pantalla
          </Button>
          {pair.error && (
            <p role="alert" className="text-destructive">
              {pair.error.message}
            </p>
          )}
        </>
      ) : code.data && remaining > 0 && !code.isError ? (
        <>
          <p className="text-lg">
            Abre Mi jornada en tu celular y escanea para registrar la entrada o
            la salida.
          </p>
          <div className="w-full max-w-80 rounded-xl bg-white p-5">
            <QRCodeSVG
              value={code.data.token}
              size={280}
              className="h-auto w-full"
              marginSize={4}
              title="Código de asistencia de la sede"
            />
          </div>
          <p className="text-lg tabular-nums">Cambia en {remaining} segundos</p>
        </>
      ) : (
        <p role="status">{code.error?.message ?? "Actualizando código…"}</p>
      )}
      {!token && code.isError && (
        <p className="text-sm text-muted-foreground">
          Pide a administración un enlace nuevo desde Configuración → Pantallas
          de asistencia.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Mantén la pantalla encendida y conectada a internet.
      </p>
    </main>
  );
}
export function DeviceDisplay() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Display />
    </QueryClientProvider>
  );
}
