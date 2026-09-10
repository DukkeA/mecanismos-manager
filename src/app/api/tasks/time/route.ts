import { requireMember } from "@/server/auth";
import { recordTaskTime } from "@/server/task-service";
import { AccessDenied } from "@/domain/permissions";
import { ZodError } from "zod";

export async function POST(request: Request) {
  // Cookie-authenticated mutations accept only requests from the configured application.
  if (!process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") !== new URL(process.env.NEXT_PUBLIC_APP_URL).origin) return Response.json({error: "Origen no autorizado."}, {status: 403});
  try {
    const actor = await requireMember();
    return Response.json(await recordTaskTime(actor, await request.json()));
  } catch (error) {
    if (error instanceof AccessDenied) return Response.json({error: error.message}, {status: 403});
    if (error instanceof ZodError || error instanceof SyntaxError) return Response.json({error: "Revisa los datos enviados."}, {status: 400});
    return Response.json({error: "No se pudo registrar el tiempo. Reintenta con la misma solicitud."}, {status: 409});
  }
}
