import { AccessDenied } from "@/domain/permissions";
import { redirect } from "next/navigation";
import { MembershipRequired, requireMember } from "@/server/auth";
import { QueryClient } from "@tanstack/react-query";
import { getWorkshopSnapshot } from "@/server/workshop-snapshot";
import { Workshop } from "@/components/workshop";
import { localTestAccessEnabled } from "@/server/local-test-access";

export const dynamic = "force-dynamic";
export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect("/login");
  const actor = await requireMember().catch((error: unknown) => {
    if (error instanceof MembershipRequired) redirect("/login?error=access");
    if (error instanceof AccessDenied) redirect("/login");
    redirect("/login?error=unavailable");
  });
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
    />
  );
}
