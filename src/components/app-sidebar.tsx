"use client";
import { useWorkshopScope } from "@/features/workshop/query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BrandLogo } from "@/components/brand-logo";
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
  Wrench as ServiceIcon,
  ChartNoAxesCombined,
  ChevronsUpDown,
  ClipboardList,
  ContactRound,
  Home,
  LogOut,
  Truck,
  Users,
  Wallet,
  FileText,
  ShoppingBag,
  HandCoins,
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
  { label: "Servicios", icon: ServiceIcon },
  { label: "Cotizaciones", icon: FileText },
  { label: "Ventas", icon: ShoppingBag },
  { label: "Cartera", icon: HandCoins },
  { label: "Caja", icon: Wallet },
  { label: "Compras", icon: Truck },
  { label: "Control de inventario", icon: Boxes },
  { label: "Garantías", icon: Wrench },
  { label: "Activos", icon: ContactRound },
  { label: "Rentabilidad", icon: ChartNoAxesCombined },
  { label: "Control de caja", icon: Wallet },
  { label: "Equipo", icon: Users },
];
export function sectionTitle(section: string) {
  if (["Caja", "Cartera", "Control de caja"].includes(section)) return "Dinero";
  if (section === "Cotizaciones") return "Ventas";
  return section;
}
export function sectionAvailable(label: string, role: Role, demo: boolean) {
  if (role === "MECHANIC" && !["Resumen", "Órdenes", "Tareas"].includes(label))
    return false;
  if (role !== "ADMIN" && ["Equipo", "Rentabilidad"].includes(label))
    return false;
  return (
    !demo ||
    ![
      "Cotizaciones",
      "Ventas",
      "Cartera",
      "Compras",
      "Control de inventario",
      "Garantías",
      "Activos",
      "Rentabilidad",
      "Control de caja",
    ].includes(label)
  );
}
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
  const { demo } = useWorkshopScope();
  const visible = workshopSections.filter(
    (s) =>
      sectionAvailable(s.label, actor.role, demo) &&
      !["Cotizaciones", "Cartera", "Control de caja"].includes(s.label),
  );
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => navigate("Resumen")}
              tooltip="Mecanismos Manager"
              aria-label="Mecanismos Técnicos · Ir al resumen"
              className="sidebar-brand-button"
            >
              <BrandLogo className="sidebar-logo-full" />
              <BrandLogo compact className="sidebar-logo-compact" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {["Taller", "Comercial", "Administración"].map((group) => {
          const items = visible.filter(
            (s) =>
              (["Caja", "Equipo", "Rentabilidad", "Control de caja"].includes(
                s.label,
              )
                ? "Administración"
                : [
                      "Clientes",
                      "Proveedores",
                      "Cotizaciones",
                      "Ventas",
                      "Cartera",
                      "Compras",
                    ].includes(s.label)
                  ? "Comercial"
                  : "Taller") === group,
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
                          isActive={
                            sectionTitle(section) === sectionTitle(label)
                          }
                          tooltip={sectionTitle(label)}
                          onClick={() => {
                            navigate(label);
                            setOpenMobile(false);
                          }}
                          aria-current={
                            sectionTitle(section) === sectionTitle(label)
                              ? "page"
                              : undefined
                          }
                        >
                          <Icon />
                          <span>{sectionTitle(label)}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          );
        })}
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
