import { afterEach,describe,expect,it,vi } from "vitest";
import { localTestAccessEnabled } from "@/server/local-test-access";
afterEach(()=>vi.unstubAllEnvs());
describe("local test access boundary",()=>{
  const local=()=>{vi.stubEnv("LOCAL_TEST_ACCESS","true");vi.stubEnv("VERCEL","");vi.stubEnv("DATABASE_URL","postgresql://runtime:password@127.0.0.1:56322/postgres");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:56321");};
  it("requires an explicit flag and the isolated local instance",()=>{local();expect(localTestAccessEnabled()).toBe(true);vi.stubEnv("LOCAL_TEST_ACCESS","false");expect(localTestAccessEnabled()).toBe(false);});
  it("rejects cloud databases, other local databases, cloud Auth and Vercel",()=>{
    local();vi.stubEnv("DATABASE_URL","postgresql://user:password@cloud.example:56322/postgres");expect(localTestAccessEnabled()).toBe(false);
    local();vi.stubEnv("DATABASE_URL","postgresql://user:password@localhost:54322/postgres");expect(localTestAccessEnabled()).toBe(false);
    local();vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://remote.supabase.co");expect(localTestAccessEnabled()).toBe(false);
    local();vi.stubEnv("VERCEL","1");expect(localTestAccessEnabled()).toBe(false);
  });
});
