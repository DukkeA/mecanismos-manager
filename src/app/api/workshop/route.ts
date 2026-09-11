import { requireMember } from "@/server/auth";
import { getWorkshopSnapshot } from "@/server/workshop-snapshot";
import { parseSort, sortSnapshot } from "@/domain/table-sort";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json(
      { error: "Sesión requerida." },
      { status: 401, headers },
    );
  let sort;
  try {
    sort = parseSort(new URL(request.url).searchParams);
  } catch {
    return Response.json(
      { error: "Ordenamiento no válido." },
      { status: 400, headers },
    );
  }
  try {
    return Response.json(
      {
        actorId: actor.id,
        ...sortSnapshot(await getWorkshopSnapshot(actor), sort),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "No se pudieron consultar los datos." },
      { status: 503, headers },
    );
  }
}
