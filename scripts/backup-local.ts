import { loadEnvFile } from "node:process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

loadEnvFile(".env.local");
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(api.hostname) || api.port !== "56321")
  throw new Error("Este script solo respalda Supabase local de Mecanismos.");
const container = "supabase_db_mecanismos-manager";
const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
const directory = resolve(".local-backups", stamp);
await mkdir(directory, { recursive: true });
const docker = (...args: string[]) =>
  execFileSync("docker", args, { maxBuffer: 64 * 1024 * 1024 });
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const dumpPath = join(directory, "workshop.dump");
const dump = docker(
  "exec",
  container,
  "pg_dump",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-n",
  "workshop",
  "-Fc",
  "--no-owner",
);
await writeFile(dumpPath, dump);
const client = new Client({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:56322/postgres",
});
await client.connect();
const { rows: files } = await client.query<{ path: string }>(
  `SELECT "storagePath" path FROM workshop."TaskPhoto" WHERE "storagePath" IS NOT NULL UNION SELECT path FROM workshop."Attachment"`,
);
const storage = createClient(api.href, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
}).storage;
const manifest: {
  path: string;
  file: string;
  sha256: string;
  bytes: number;
}[] = [];
for (const [index, row] of files.entries()) {
  const { data, error } = await storage
    .from("workshop-documents")
    .download(row.path);
  if (error || !data)
    throw new Error(`No se pudo respaldar el archivo ${index + 1}.`);
  const bytes = Buffer.from(await data.arrayBuffer()),
    file = `attachment-${index}.bin`;
  await writeFile(join(directory, file), bytes);
  if (hash(await readFile(join(directory, file))) !== hash(bytes))
    throw new Error("Falló la verificación del archivo.");
  manifest.push({
    path: row.path,
    file,
    sha256: hash(bytes),
    bytes: bytes.length,
  });
}
const restoreBucket = `workshop-restore-${stamp}`;
if(manifest.length){
 const created=await storage.createBucket(restoreBucket,{public:false});
 if(created.error)throw new Error("No se pudo crear el bucket de restauración local.");
 for(const file of manifest){
  const bytes=await readFile(join(directory,file.file));
  const uploaded=await storage.from(restoreBucket).upload(file.path,bytes,{upsert:false});
  if(uploaded.error)throw new Error("No se pudo restaurar el archivo privado.");
  const downloaded=await storage.from(restoreBucket).download(file.path);
  if(downloaded.error || !downloaded.data || hash(Buffer.from(await downloaded.data.arrayBuffer()))!==file.sha256)throw new Error("La copia restaurada del archivo no coincide.");
 }
}
// A new isolated database proves the dump can be restored. The original is never reset.
const restoreDb = `workshop_restore_${stamp}`;
docker("exec", container, "createdb", "-U", "postgres", restoreDb);
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    container,
    "pg_restore",
    "-U",
    "postgres",
    "-d",
    restoreDb,
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
  ],
  { input: dump, maxBuffer: 8 * 1024 * 1024 },
);
const restored = new Client({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:56322/${restoreDb}`,
});
await restored.connect();
const tables = (
  await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='workshop' ORDER BY tablename",
  )
).rows;
const counts: Record<string, number> = {};
for (const { tablename } of tables) {
  const quoted = '"' + tablename.replaceAll('"', '""') + '"';
  const original = await client.query(
    `SELECT count(*)::int n FROM workshop.${quoted}`,
  );
  const copy = await restored.query(
    `SELECT count(*)::int n FROM workshop.${quoted}`,
  );
  if (original.rows[0].n !== copy.rows[0].n)
    throw new Error(
      `Cambió ${tablename} durante el respaldo; repite sin escrituras activas.`,
    );
  counts[tablename] = copy.rows[0].n;
}
await writeFile(
  join(directory, "manifest.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      database: {
        file: "workshop.dump",
        sha256: hash(dump),
        bytes: dump.length,
        restoreDb,
        counts,
      },
      restoreBucket: manifest.length ? restoreBucket : null,
      files: manifest,
    },
    null,
    2,
  ),
);
await restored.end();
await client.end();
console.log(
  JSON.stringify({
    directory,
    restoreDb,
    tables: tables.length,
    files: manifest.length,
    verified: true,
  }),
);
