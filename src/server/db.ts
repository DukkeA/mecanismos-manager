import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseConfig } from "./database-config";

const globalDb = globalThis as unknown as { workshopDb?: PrismaClient };
export function db(): PrismaClient {
  if (!process.env.DATABASE_URL)
    throw new Error("Falta configurar DATABASE_URL.");
  if (!globalDb.workshopDb)
    globalDb.workshopDb = new PrismaClient({
      adapter: new PrismaPg(
        databaseConfig(process.env.DATABASE_URL, process.env.DATABASE_SSL_CA),
      ),
    });
  return globalDb.workshopDb;
}
