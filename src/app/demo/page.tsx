import { Workshop } from "@/components/workshop";
import { demoOrders } from "@/domain/workshop-view";
import { demoOperations } from "@/domain/operations-view";
import { redirect } from "next/navigation";
import { localTestAccessEnabled } from "@/server/local-test-access";
export const dynamic = "force-dynamic";

export default function Demo() {
  if (localTestAccessEnabled() || process.env.VERCEL) redirect("/");
  return (
    <Workshop
      demo
      initialOrders={demoOrders}
      initialOperations={{
        ...demoOperations,
        tasks: demoOrders.flatMap((o, i) =>
          o.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            orderId: o.id,
            status: t.status,
            members: [`tech-${(i % 4) + 1}`],
          })),
        ),
      }}
      actor={{ id: "demo", name: "Administrador", role: "ADMIN" }}
      locations={[{ id: "demo-location", name: "Bodega / taller" }]}
    />
  );
}
