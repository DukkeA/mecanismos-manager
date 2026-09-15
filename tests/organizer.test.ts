import { describe, expect, it } from "vitest";
import {
  assertOrganizerAccess,
  organizerDateTime,
  organizerInput,
  bogotaDate,
} from "@/domain/organizer";
const owner = { id: "owner", role: "OFFICE" as const },
  admin = { id: "admin", role: "ADMIN" as const };
const base = {
  requestId: "00000000-0000-4000-8000-000000000001",
  kind: "TODO",
  visibility: "PERSONAL",
  title: "Llamar al proveedor",
};
describe("office organizer boundaries", () => {
  it("denies mechanics, including shared entries", () => {
    expect(() =>
      assertOrganizerAccess(
        { id: "owner", role: "MECHANIC" },
        { ownerId: "owner", visibility: "GENERAL" },
      ),
    ).toThrow();
  });
  it("keeps personal notes private even from an administrator", () => {
    expect(() =>
      assertOrganizerAccess(admin, {
        ownerId: owner.id,
        visibility: "PERSONAL",
      }),
    ).toThrow();
    expect(() =>
      assertOrganizerAccess(
        owner,
        { ownerId: owner.id, visibility: "PERSONAL" },
        true,
      ),
    ).not.toThrow();
  });
  it("allows office edits but reserves shared deletion to admin", () => {
    const shared = { ownerId: "someone", visibility: "GENERAL" };
    expect(() => assertOrganizerAccess(owner, shared)).not.toThrow();
    expect(() => assertOrganizerAccess(owner, shared, true)).toThrow();
    expect(() => assertOrganizerAccess(admin, shared, true)).not.toThrow();
  });
  it("requires a schedule for calendar entries and rejects inverted events", () => {
    expect(organizerInput.safeParse({ ...base, calendar: true }).success).toBe(
      false,
    );
    expect(organizerInput.safeParse({ ...base, kind: "EVENT" }).success).toBe(
      false,
    );
    expect(
      organizerInput.safeParse({
        ...base,
        kind: "EVENT",
        startsAt: "2026-09-15T10:00:00-05:00",
        endsAt: "2026-09-15T09:00:00-05:00",
      }).success,
    ).toBe(false);
    expect(
      organizerInput.safeParse({
        ...base,
        calendar: true,
        startsAt: "2026-09-15T10:00:00-05:00",
      }).success,
    ).toBe(true);
  });
  it("keeps unscheduled to-dos valid and uses Bogotá wall time", () => {
    expect(organizerInput.safeParse(base).success).toBe(true);
    expect(organizerDateTime("2026-09-15", "08:30")).toBe(
      "2026-09-15T08:30:00-05:00",
    );
    expect(bogotaDate("2026-09-16T02:00:00Z")).toBe("2026-09-15");
  });
});
