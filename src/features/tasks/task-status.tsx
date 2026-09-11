"use client";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useTaskMutation } from "./hooks";
import { toast } from "sonner";
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

export function TaskStatusDropdown({
  task,
  locked,
}: {
  task: {
    id: string;
    title: string;
    status: string;
    deletedAt?: string | null;
  };
  locked: boolean;
}) {
  const mutation = useTaskMutation();
  if (locked || task.deletedAt) return <TaskBadge status={task.status} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge
          asChild
          variant="secondary"
          className="task-state task-status-trigger"
          data-task-state={task.status}
        >
          <button
            type="button"
            disabled={mutation.isPending}
            aria-label={`Estado de ${task.title}: ${states[task.status as keyof typeof states]}`}
          >
            <span aria-hidden="true" />
            {states[task.status as keyof typeof states]}
            <ChevronDown />
          </button>
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={task.status}
          onValueChange={(status) => {
            if (status === task.status || mutation.isPending) return;
            mutation.mutate(
              { kind: "task-status", input: { taskId: task.id, status } },
              {
                onSuccess: () =>
                  toast.success(
                    `Estado: ${states[status as keyof typeof states]}.`,
                  ),
                onError: (error) =>
                  toast.error(error.message || "No se pudo cambiar el estado."),
              },
            );
          }}
        >
          {Object.keys(states).map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <TaskBadge status={value} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
