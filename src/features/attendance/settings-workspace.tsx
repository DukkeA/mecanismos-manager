"use client";
import { useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timeOfDay, type WorkshopSettings } from "@/domain/workshop-settings";
import { useSettings, useAttendanceCommand } from "./hooks";
function ScheduleForm({ settings }: { settings: WorkshopSettings }) {
  const command = useAttendanceCommand();
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        try {
          await command.mutateAsync({
            kind: "settings",
            input: {
              requestId: crypto.randomUUID(),
              version: settings.version,
              start: values.get("start"),
              end: values.get("end"),
              saturdayStart: values.get("saturdayStart"),
              saturdayEnd: values.get("saturdayEnd"),
              graceMinutes: values.get("graceMinutes"),
            },
          });
          toast.success("Configuración guardada.");
        } catch {
          /* Keep inputs and show the server error below. */
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="global-start">Entrada · lunes a viernes</Label>
          <Input
            id="global-start"
            name="start"
            type="time"
            required
            defaultValue={timeOfDay(settings.startMinute)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="global-end">Salida · lunes a viernes</Label>
          <Input
            id="global-end"
            name="end"
            type="time"
            required
            defaultValue={timeOfDay(settings.endMinute)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="global-grace">Tolerancia de llegada (min)</Label>
          <Input
            id="global-grace"
            name="graceMinutes"
            type="number"
            min={0}
            max={60}
            step={1}
            required
            defaultValue={settings.graceMinutes}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="saturday-start">Entrada · sábado</Label>
          <Input
            id="saturday-start"
            name="saturdayStart"
            type="time"
            required
            defaultValue={timeOfDay(settings.saturdayStartMinute)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="saturday-end">Salida · sábado</Label>
          <Input
            id="saturday-end"
            name="saturdayEnd"
            type="time"
            required
            defaultValue={timeOfDay(settings.saturdayEndMinute)}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Se aplica a todo el equipo de lunes a sábado. Los domingos no tienen
        jornada programada. Se registra la entrada y la salida, sin descontar
        almuerzo. Los cambios se aplican a las jornadas que se registren después
        de guardar; las anteriores conservan su horario.
      </p>
      <p className="text-sm text-muted-foreground">
        La tolerancia evita marcar retrasos dentro de ese margen. Al superarlo,
        se cuenta desde la hora de entrada, excluyendo el tiempo cubierto por
        permisos autorizados.
      </p>
      {command.error && (
        <p role="alert" className="text-destructive">
          {command.error.message}
        </p>
      )}
      <Button type="submit" disabled={command.isPending}>
        Guardar horario
      </Button>
    </form>
  );
}
function DeviceSetup({ location }: { location: { id: string; name: string } }) {
  const command = useAttendanceCommand(),
    [link, setLink] = useState("");
  return (
    <div className="space-y-3 border-t py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{location.name}</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={command.isPending}
            onClick={async () => {
              try {
                const result = await command.mutateAsync({
                  kind: "device",
                  input: {
                    requestId: crypto.randomUUID(),
                    locationId: location.id,
                  },
                });
                if ("token" in result)
                  setLink(
                    `${window.location.origin}/attendance-station#pair=${result.token}`,
                  );
              } catch {
                /* Error shown below. */
              }
            }}
          >
            Vincular pantalla
          </Button>
          <Button
            variant="ghost"
            disabled={command.isPending}
            onClick={async () => {
              try {
                await command.mutateAsync({
                  kind: "station",
                  input: {
                    requestId: crypto.randomUUID(),
                    locationId: location.id,
                    active: false,
                  },
                });
                setLink("");
                toast.success("Pantalla desactivada.");
              } catch {
                /* Error shown below. */
              }
            }}
          >
            Desactivar pantalla
          </Button>
        </div>
      </div>
      {link && (
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <p>
            Abre este enlace en la tablet o escanéalo con su cámara. Vence en 10
            minutos y solo se puede usar una vez. Al vincularla, se desconecta
            la pantalla anterior de esta sede.
          </p>
          <div className="w-fit rounded-lg bg-white p-3">
            <QRCodeSVG
              value={link}
              size={180}
              marginSize={4}
              title={`Vincular pantalla de ${location.name}`}
            />
          </div>
          <Label htmlFor={`pair-${location.id}`}>Enlace para la tablet</Label>
          <Input
            id={`pair-${location.id}`}
            value={link}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success("Enlace copiado.");
              } catch {
                toast.error("Selecciona el enlace y cópialo.");
              }
            }}
          >
            Copiar enlace
          </Button>
        </div>
      )}
      {command.error && (
        <p role="alert" className="text-destructive">
          {command.error.message}
        </p>
      )}
    </div>
  );
}
import { CategorySettings } from "@/features/categories/category-settings";
export function SettingsWorkspace({
  locations,
}: {
  locations: { id: string; name: string }[];
}) {
  const settings = useSettings();
  return (
    <div className="max-w-4xl space-y-8">
      <CategorySettings />
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Horario del equipo</h2>
          <p className="mt-1 text-muted-foreground">
            Horas de Bogotá · Configuración general del taller
          </p>
        </div>
        {settings.data ? (
          <ScheduleForm key={settings.data.version} settings={settings.data} />
        ) : (
          <p role="status">
            {settings.error?.message ?? "Cargando configuración…"}
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Pantallas de asistencia</h2>
        <p className="text-muted-foreground">
          Deja una tablet o celular en cada sede. El QR cambia cada 30 segundos.
          La pantalla vinculada muestra únicamente el código y no necesita una
          sesión de administrador.
        </p>
        {locations.map((location) => (
          <DeviceSetup key={location.id} location={location} />
        ))}
      </section>
    </div>
  );
}
