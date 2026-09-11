import { execFileSync } from "node:child_process";
import { readFile, appendFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";

loadEnvFile(".env.local");
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:56321")
  throw new Error("Este comando solo configura el almacenamiento local de Mecanismos.");
const status = JSON.parse(execFileSync("pnpm.cmd", ["dlx", "supabase@2.116.0", "status", "--output", "json"], {
  encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"],
}));
if (status.API_URL !== process.env.NEXT_PUBLIC_SUPABASE_URL)
  throw new Error("La instancia de Docker no coincide con el entorno local.");
const secret = process.env.SUPABASE_SECRET_KEY || status.SECRET_KEY || status.SERVICE_ROLE_KEY;
if (!secret) throw new Error("Supabase local no devolvió una clave de servidor.");
const source = await readFile(".env.local", "utf8");
if (!/^SUPABASE_SECRET_KEY=/m.test(source)) {
  await appendFile(".env.local", `\n# Server only: local private Storage.\nSUPABASE_SECRET_KEY=${secret}\n`);
} else if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error("Completa SUPABASE_SECRET_KEY en .env.local o elimina la línea vacía y repite el comando.");
}
const storage = createClient(status.API_URL, secret, { auth: { persistSession: false } }).storage;
const name = "workshop-documents";
const { data, error } = await storage.getBucket(name);
if (error) {
  const result = await storage.createBucket(name, {
    public: false, fileSizeLimit: 3 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  });
  if (result.error) throw result.error;
} else if (data.public) {
  throw new Error("El bucket existente es público. Revisa su configuración antes de continuar.");
}
console.log("Almacenamiento privado local configurado. No se imprimieron secretos.");
