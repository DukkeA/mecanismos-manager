import Link from "next/link";
import { LogIn } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { localTestAccessEnabled } from "@/server/local-test-access";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.GOOGLE_AUTH_ENABLED === "true";
  const local = localTestAccessEnabled();
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-panel">
        <BrandLogo className="login-logo" />
        <h1>Ingresar al taller</h1>
        <p>Mecanismos Técnicos SAS</p>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>No se pudo iniciar sesión</AlertTitle>
            <AlertDescription>
              {error === "local"
                ? "Revisa que Supabase local esté encendido y que se hayan cargado los datos de prueba."
                : "Intenta de nuevo. Si el problema continúa, pide a un administrador que revise tu acceso."}
            </AlertDescription>
          </Alert>
        )}
        {local ? (
          <>
            <Alert>
              <AlertTitle>Pruebas locales</AlertTitle>
              <AlertDescription>
                Elige un perfil para probar sus permisos. Los datos son
                ficticios y los cambios quedan guardados.
              </AlertDescription>
            </Alert>
            {[
              ["admin", "Claudia Rojas · Administración"],
              ["office", "Paola Méndez · Oficina"],
              ["mechanic", "Luis Cárdenas · Mecánico"],
            ].map(([role, label]) => (
              <form key={role} action="/dev/access" method="post">
                <input type="hidden" name="role" value={role} />
                <Button type="submit" variant="outline" className="w-full">
                  {label}
                </Button>
              </form>
            ))}
          </>
        ) : configured ? (
          <form action="/auth/login" method="post">
            <Button type="submit" size="lg">
              <LogIn data-icon="inline-start" />
              Continuar con Google
            </Button>
          </form>
        ) : (
          <Alert>
            <AlertTitle>Google aún no está configurado</AlertTitle>
            <AlertDescription>
              Un administrador debe habilitar el acceso del equipo.
            </AlertDescription>
          </Alert>
        )}
        {!local && !process.env.VERCEL && (
          <Button variant="outline" asChild>
            <Link href="/demo">Ver datos de ejemplo</Link>
          </Button>
        )}
      </section>
    </main>
  );
}
