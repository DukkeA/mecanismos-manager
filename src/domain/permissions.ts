export type Role = "ADMIN" | "OFFICE" | "MECHANIC";
export type Permission = "customers:write" | "inventory:write" | "orders:write" | "tasks:contribute" | "finance:write" | "payroll:read" | "profitability:read" | "members:write";

const grants: Record<Role, readonly Permission[]> = {
  ADMIN: ["customers:write", "inventory:write", "orders:write", "tasks:contribute", "finance:write", "payroll:read", "profitability:read", "members:write"],
  OFFICE: ["customers:write", "inventory:write", "orders:write", "tasks:contribute", "finance:write"],
  MECHANIC: ["tasks:contribute"],
};

export function can(role: Role, permission: Permission): boolean {
  return grants[role]?.includes(permission) ?? false;
}

export class AccessDenied extends Error {
  constructor() { super("No tienes permiso para esta operación."); }
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new AccessDenied();
}

export function canContributeToTask(role: Role, memberId: string, assigneeIds: readonly string[]): boolean {
  return role !== "MECHANIC" || assigneeIds.includes(memberId);
}
