import { defineConfig } from "vitest/config";
import config from "./vitest.config";

export default defineConfig({resolve: config.resolve, test: {
  include: ["tests/integration/**/*.test.ts"],
  exclude: ["node_modules/**", ".next/**"],
  env: {DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:56322/postgres"},
}});
