import { loadEnvFile } from "node:process";
loadEnvFile(".env.local");
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid");
if (api.hostname !== "127.0.0.1" || api.port !== "56321")
  throw new Error(
    "Las cargas de prueba solo admiten Supabase local de Mecanismos.",
  );
// These maintenance jobs use the local fixture administrator, never a cloud credential.
process.env.DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:56322/postgres";
switch (process.argv[2]) {
  case "commerce":
    await import("./seed-commerce");
    break;
  case "attendance":
    await import("./seed-attendance");
    break;
  case "payroll":
    await import("./seed-payroll-payments");
    break;
  case "benefits":
    await import("./seed-employee-benefits");
    break;
  case "team":
    await import("./seed-team");
    break;
  case "control":
    await import("./seed-control");
    break;
  case "supports":
    await import("./seed-supports");
    break;
  case "photos":
    await import("./migrate-local-photos");
    break;
  default:
    throw new Error("Trabajo local no reconocido.");
}
