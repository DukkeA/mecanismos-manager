import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { databaseConfig } from "./database-config";

describe("database TLS configuration", () => {
  it("preserves the supplied CA when pg parses SSL query parameters", () => {
    const config = databaseConfig(
      "postgresql://runtime:password@db.example.com:6543/postgres?sslmode=no-verify&sslrootcert=missing.crt&application_name=workshop",
      "certificate\\ncontents",
    );
    const client = new Client(config);
    expect(client.ssl).toEqual({
      ca: "certificate\ncontents",
      rejectUnauthorized: true,
    });
    expect(
      new URL(config.connectionString!).searchParams.get("application_name"),
    ).toBe("workshop");
  });

  it("keeps Docker connections unchanged without a custom CA", () => {
    const connectionString =
      "postgresql://postgres:postgres@127.0.0.1:56322/postgres";
    expect(databaseConfig(connectionString)).toEqual({
      connectionString,
      max: 5,
    });
  });
});
