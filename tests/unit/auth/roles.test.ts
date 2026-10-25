import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { assertRole, hasRole, safeCallbackPath, toRole, type SessionUser } from "@/server/roles";
import { getAdminOverview } from "@/server/services/admin.service";

const user = (role: SessionUser["role"]): SessionUser => ({
  id: "u1",
  email: "a@b.c",
  name: "A",
  role,
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? `${e.code}:${e.status}` : "other";
  }
}

describe("assertRole", () => {
  it("rejects a missing user with UNAUTHENTICATED 401", () => {
    expect(codeOf(() => assertRole(null, "ADMIN"))).toBe("UNAUTHENTICATED:401");
  });
  it("rejects the wrong role with FORBIDDEN 403", () => {
    expect(codeOf(() => assertRole(user("USER"), "ADMIN"))).toBe("FORBIDDEN:403");
    expect(codeOf(() => assertRole(user("OWNER"), "ADMIN"))).toBe("FORBIDDEN:403");
  });
  it("accepts an allowed role", () => {
    expect(assertRole(user("ADMIN"), "ADMIN").role).toBe("ADMIN");
    expect(hasRole(user("ADMIN"), ["OWNER", "ADMIN"])).toBe(true);
  });
});

describe("admin service", () => {
  it("throws FORBIDDEN for a USER actor before reading any data", async () => {
    await expect(getAdminOverview(user("USER"))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });
  it("throws UNAUTHENTICATED without an actor", async () => {
    await expect(getAdminOverview(null)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });
});

describe("helpers", () => {
  it("treats unknown roles as USER", () => {
    expect(toRole("SUPERUSER")).toBe("USER");
  });
  it("only allows same-site relative callback paths", () => {
    expect(safeCallbackPath("/admin/import")).toBe("/admin/import");
    expect(safeCallbackPath("https://evil.example")).toBe("/");
    expect(safeCallbackPath("//evil.example")).toBe("/");
    expect(safeCallbackPath(undefined)).toBe("/");
  });

  it("keeps a /rate step with its query, and refuses what Better Auth would refuse", () => {
    expect(safeCallbackPath("/rate?city=islamabad&r=butt-karahi-f-7&d=chicken-karahi")).toBe(
      "/rate?city=islamabad&r=butt-karahi-f-7&d=chicken-karahi",
    );
    expect(safeCallbackPath("/\t/evil.example")).toBe("/");
    expect(safeCallbackPath("/a\\b")).toBe("/");
    expect(safeCallbackPath("/\\evil.example")).toBe("/");
    expect(safeCallbackPath("/%2F%2Fevil.example")).toBe("/");
    expect(safeCallbackPath("/x%5cy")).toBe("/");
    expect(safeCallbackPath("/me?next=%2F%2Fok")).toBe("/me?next=%2F%2Fok"); // only the path is checked
  });
});
