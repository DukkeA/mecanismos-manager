import { requireMember } from "@/server/auth";
import { getWorkshopSnapshot } from "@/server/workshop-snapshot";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json(
      { error: "Sesión requerida." },
      { status: 401, headers },
    );
  try {
    return Response.json(
      { actorId: actor.id, ...(await getWorkshopSnapshot(actor)) },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "No se pudieron consultar los datos." },
      { status: 503, headers },
    );
  }
}
