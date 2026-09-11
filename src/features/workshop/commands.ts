"use client";
import { useCashMutation } from "../cash/hooks";
import { useContactMutation } from "../contacts/hooks";
import { useInventoryMutation } from "../inventory/hooks";
import { useOrderTransition } from "../orders/hooks";
import { useTaskMutation } from "../tasks/hooks";
import { useTeamMutation } from "../team/hooks";
export function useWorkshopCommands() {
  const task = useTaskMutation(),
    cash = useCashMutation(),
    inventory = useInventoryMutation(),
    contact = useContactMutation(),
    team = useTeamMutation(),
    order = useOrderTransition();
  return async (kind: string, input: Record<string, unknown>) => {
    const mutation = [
      "task",
      "task-status",
      "task-edit",
      "task-note",
      "task-archive",
    ].includes(kind)
      ? task
      : ["account", "obligation", "cash", "cash-reversal", "cash-transfer"].includes(kind)
        ? cash
        : ["item", "offer", "stock", "stock-reversal"].includes(kind)
          ? inventory
          : ["customer", "supplier", "customer-delete", "supplier-delete"].includes(kind)
            ? contact
            : kind === "member"
              ? team
              : order;
    await mutation.mutateAsync({ kind, input });
  };
}
