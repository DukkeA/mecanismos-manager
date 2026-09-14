import { redirect } from "next/navigation";
import { requireMember } from "@/server/auth";
import { QueryClient } from "@tanstack/react-query";
import { getWorkshopSnapshot } from "@/server/workshop-snapshot";
import { Workshop } from "@/components/workshop";
import { localTestAccessEnabled } from "@/server/local-test-access";

export const dynamic = "force-dynamic";
export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect("/login");
  const actor = await requireMember().catch(() => null);
  if (!actor) redirect("/login");
  const queryClient = new QueryClient();
  const { orders, locations, operations } = await queryClient.fetchQuery({
    queryKey: ["workshop", actor.id],
    queryFn: () => getWorkshopSnapshot(actor),
  });
  return (
    <Workshop
      initialOrders={orders}
      actor={actor}
      locations={locations}
      initialOperations={operations}
      localTesting={localTestAccessEnabled()}
      cloudTesting={process.env.APP_ENVIRONMENT === "test"}
    />
  );
}
