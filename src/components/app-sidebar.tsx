"use client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Role } from "@/domain/permissions";
import { useSignOut } from "@/features/workshop/session";
import {
  Boxes,
  Building2,
  ChartNoAxesCombined,
  ChevronsUpDown,
  ClipboardList,
  ContactRound,
  Home,
  LogOut,
  Truck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export const workshopSections = [
  { label: "Resumen", icon: Home },
  { label: "Órdenes", icon: ClipboardList },
  { label: "Tareas", icon: Wrench },
  { label: "Clientes", icon: ContactRound },
  { label: "Proveedores", icon: Truck },
  { label: "Inventario", icon: Boxes },
  { label: "Caja", icon: Wallet },
  { label: "Equipo", icon: Users },
];
export function AppSidebar({
  actor,
  section,
  navigate,
  localTesting,
}: {
  actor: { name: string; role: Role };
  section: string;
  navigate: (section: string) => void;
  localTesting: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const logout = useSignOut();
  const visible = workshopSections
    .filter(
      (s) =>
        actor.role !== "MECHANIC" ||
        ["Resumen", "Órdenes", "Tareas"].includes(s.label),
    )
    .filter((s) => actor.role === "ADMIN" || s.label !== "Equipo");
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => navigate("Resumen")}
              tooltip="Mecanismos Manager"
            >
              <div className="sidebar-brand-mark">
                <Wrench aria-hidden="true" />
              </div>
              <span className="sidebar-wordmark">
                Mecanismos<small>Manager</small>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {["Taller", "Administración"].map((group) => {
          const items = visible.filter(
            (s) =>
              ["Caja", "Equipo"].includes(s.label) ===
              (group === "Administración"),
          );
          return (
            items.length > 0 && (
              <SidebarGroup key={group}>
                <SidebarGroupLabel>{group}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map(({ label, icon: Icon }) => (
                      <SidebarMenuItem key={label}>
                        <SidebarMenuButton
                          isActive={section === label}
                          tooltip={label}
                          onClick={() => {
                            navigate(label);
                            setOpenMobile(false);
                          }}
                          aria-current={section === label ? "page" : undefined}
                        >
                          <Icon />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          );
        })}
        <SidebarGroup className="mt-auto group-data-[collapsible=icon]:hidden">
          <div className="sidebar-location">
            <Building2 aria-hidden="true" />
            <div>
              Bogotá<small>Oficina y bodega / taller</small>
            </div>
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  aria-label={`Menú de ${actor.name}`}
                >
                  <Avatar>
                    <AvatarFallback>
                      {actor.name
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="sidebar-user">
                    {actor.name}
                    <small>
                      {actor.role === "ADMIN"
                        ? "Administración"
                        : actor.role === "OFFICE"
                          ? "Oficina"
                          : "Mecánico"}
                    </small>
                  </span>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "bottom" : "right"}
                align="end"
                className="min-w-56"
              >
                <DropdownMenuLabel>{actor.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={() => {
                      navigate("Tareas");
                      setOpenMobile(false);
                    }}
                  >
                    <ChartNoAxesCombined />
                    Tareas y asignaciones
                  </DropdownMenuItem>
                  {localTesting && (
                    <DropdownMenuItem asChild>
                      <Link href="/login">Cambiar usuario de prueba</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={logout.isPending}
                    onSelect={() =>
                      logout.mutate(undefined, {
                        onError: (error) => toast.error(error.message),
                      })
                    }
                  >
                    <LogOut />
                    {logout.isPending ? "Cerrando sesión…" : "Cerrar sesión"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
