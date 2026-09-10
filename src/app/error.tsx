"use client";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-6 pt-20">
      <Alert>
        <AlertTitle>No pudimos cargar esta vista</AlertTitle>
        <AlertDescription>
          Comprueba tu conexión y vuelve a intentarlo. Si acababas de guardar,
          revisa el registro antes de enviarlo otra vez.
        </AlertDescription>
      </Alert>
      <Button className="mt-4" onClick={retry}>
        Volver a cargar
      </Button>
    </main>
  );
}
