import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env.local");
} catch {
  /* CI provides Storage configuration separately. */
}
import { defineConfig } from "vitest/config";
import config from "./vitest.config";

export default defineConfig({
  resolve: config.resolve,
  test: {
    include: ["tests/integration/**/*.test.ts"],
    // Files share one local database; individual tests still exercise concurrent commands.
    fileParallelism: false,
    exclude: ["node_modules/**", ".next/**"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:56322/postgres",
    },
  },
});
