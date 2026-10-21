export function orderTeam(
  coordinator: { id: string; name: string } | null,
  tasks: { assignments: { memberId: string; member: { name: string } }[] }[],
) {
  const members = new Map<string, string>();
  if (coordinator) members.set(coordinator.id, coordinator.name);
  for (const task of tasks)
    for (const assignment of task.assignments)
      members.set(assignment.memberId, assignment.member.name);
  return {
    memberIds: [...members.keys()],
    label: [...members.values()].join(", ") || "Sin asignar",
  };
}
