import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  exchange: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mocks.getUser,
      exchangeCodeForSession: mocks.exchange,
      signOut: mocks.signOut,
      signInWithOAuth: mocks.signIn,
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("./db", () => ({
  db: () => ({
    $transaction: async (run: (tx: unknown) => unknown) =>
      run({
        member: {
          findUnique: mocks.findUnique,
          updateMany: mocks.updateMany,
        },
      }),
  }),
}));
import { requireMember, MembershipRequired } from "./auth";
import { AccessDenied } from "@/domain/permissions";
import { GET } from "@/app/auth/callback/route";
import { POST } from "@/app/auth/login/route";
const callback = () =>
  GET(new Request("https://workshop.example/auth/callback?code=test"));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://workshop.example");
  vi.stubEnv("GOOGLE_AUTH_ENABLED", "true");
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: "identity",
        email: "Person@Example.com",
        email_confirmed_at: "2026-01-01",
      },
    },
    error: null,
  });
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.findUnique.mockResolvedValue(null);
  mocks.updateMany.mockResolvedValue({ count: 0 });
});
afterEach(() => vi.unstubAllEnvs());
describe("workshop login authorization", () => {
  it("rejects an unknown verified account and ends its local session", async () => {
    const response = await callback();
    expect(response.headers.get("location")).toBe(
      "https://workshop.example/login?error=access",
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { email: "person@example.com", authSubject: null, active: true },
      data: { authSubject: "identity" },
    });
  });
  it("rejects a previously linked inactive member", async () => {
    mocks.findUnique.mockResolvedValue({ id: "member", active: false });
    await expect(requireMember()).rejects.toBeInstanceOf(MembershipRequired);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it.each(["ADMIN", "OFFICE", "MECHANIC"])(
    "admits an active %s without changing their role",
    async (role) => {
      mocks.findUnique.mockResolvedValue({
        id: "member",
        active: true,
        name: "Persona",
        role,
      });
      const response = await callback();
      expect(response.headers.get("location")).toBe(
        "https://workshop.example/",
      );
      expect(mocks.signOut).not.toHaveBeenCalled();
      expect((await requireMember()).role).toBe(role);
    },
  );
  it("binds an existing pre-authorized member on first sign-in", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "member",
        active: true,
        name: "Persona",
        role: "OFFICE",
      });
    expect((await requireMember()).role).toBe("OFFICE");
  });
  it("does not label a database outage as denied membership", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database unavailable"));
    expect((await callback()).headers.get("location")).toBe(
      "https://workshop.example/login?error=unavailable",
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("keeps expired OAuth codes separate from membership failures", async () => {
    mocks.exchange.mockResolvedValue({ error: { message: "expired code" } });
    expect((await callback()).headers.get("location")).toBe(
      "https://workshop.example/login?error=oauth",
    );
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("requires a verified email before consulting membership", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "identity", email: "person@example.com" } },
      error: null,
    });
    await expect(requireMember()).rejects.toBeInstanceOf(AccessDenied);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("offers account selection when restarting Google login", async () => {
    mocks.signIn.mockResolvedValue({
      data: { url: "https://accounts.google.com/test" },
      error: null,
    });
    const response = await POST(
      new Request("https://workshop.example/auth/login", {
        method: "POST",
        headers: { origin: "https://workshop.example" },
      }),
    );
    expect(response.status).toBe(303);
    expect(mocks.signIn).toHaveBeenCalledWith({
      provider: "google",
      options: {
        queryParams: { prompt: "select_account" },
        redirectTo: "https://workshop.example/auth/callback",
      },
    });
  });
});
