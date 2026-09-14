import type { PoolConfig } from "pg";

export function databaseConfig(
  connectionString: string,
  certificate?: string,
): PoolConfig {
  if (!certificate) return { connectionString, max: 5 };

  const url = new URL(connectionString);
  // pg replaces the entire ssl object when these URL parameters are present.
  // The supplied CA always uses certificate and hostname verification.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(key);
  }
  return {
    connectionString: url.href,
    max: 5,
    ssl: { ca: certificate.replace(/\\n/g, "\n"), rejectUnauthorized: true },
  };
}
