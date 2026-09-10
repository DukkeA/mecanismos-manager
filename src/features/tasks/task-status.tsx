import { Badge } from "@/components/ui/badge";
export const states = {
  TODO: "Pendiente",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueada",
  DONE: "Terminada",
};
export function TaskBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className="task-state" data-task-state={status}>
      <span aria-hidden="true" />
      {states[status as keyof typeof states]}
    </Badge>
  );
}
