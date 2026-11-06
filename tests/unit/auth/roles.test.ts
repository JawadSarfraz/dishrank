import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import {
  assertRole,
  hasRole,
  safeCallbackPath,
  safeNextPath,
  signedInRedirectPath,
  toRole,
  type SessionUser,
} from "@/server/roles";
import { getAdminOverview } from "@/server/services/admin.service";
import { panelInviteCreateInput } from "@/server/validation";

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

  it("sends a signed-in visitor of /sign-in on to a same-site callbackUrl, else home, never back", () => {
    expect(signedInRedirectPath("/rate?city=islamabad")).toBe("/rate?city=islamabad");
    expect(signedInRedirectPath("/admin/import")).toBe("/admin/import");
    expect(signedInRedirectPath("https://evil.example/x")).toBe("/");
    expect(signedInRedirectPath("//evil.example")).toBe("/");
    expect(signedInRedirectPath("/\\evil.example")).toBe("/");
    expect(signedInRedirectPath(["/me", "/rate"])).toBe("/"); // a repeated parameter
    expect(signedInRedirectPath(undefined)).toBe("/");
    expect(signedInRedirectPath("/sign-in?callbackUrl=%2Fme")).toBe("/");
    expect(signedInRedirectPath("/sign-in/")).toBe("/");
    expect(signedInRedirectPath("/sign-in-help")).toBe("/sign-in-help");
    expect(signedInRedirectPath("/me?next=%2F%2Fok")).toBe("/me?next=%2F%2Fok");
  });

  it("reads the callbackUrl as a browser would: dot segments resolved, non-ASCII encoded", () => {
    // Back to /sign-in or out to another site through dot segments: home.
    expect(signedInRedirectPath("/x/../sign-in?callbackUrl=%2Fme")).toBe("/");
    expect(signedInRedirectPath("/x/%2e%2e/sign-in")).toBe("/");
    expect(signedInRedirectPath("/sign-in/.")).toBe("/");
    expect(signedInRedirectPath("/.//evil.example")).toBe("/");
    expect(signedInRedirectPath("/x/..//evil.example")).toBe("/");
    // A Location header takes Latin-1 only: Urdu letters and U+FFFD (a broken %XX) are encoded.
    expect(signedInRedirectPath("/\u0643")).toBe("/%D9%83");
    expect(signedInRedirectPath("/rate?d=\u0643")).toBe("/rate?d=%D9%83");
    expect(signedInRedirectPath("/\uFFFD")).toBe("/%EF%BF%BD");
  });
});

describe("an invite link's next path stays on this site", () => {
  it.each([
    "/islamabad/best-zinger-burger?rate=1",
    "/rawalpindi",
    "/rate?city=islamabad",
    "/joinus", // only /join itself is refused
  ])("keeps %s", (path) => expect(safeNextPath(path)).toBe(path));

  it.each([
    "https://evil.example",
    "http://evil.example/islamabad",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%5cevil.example",
    "/.//evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
    "/",
    "/join/abc",
    "/join",
    "/sign-in?callbackUrl=/x",
    "/api/v1/cities",
    `/${"x".repeat(300)}`,
  ])("refuses %s", (path) => expect(safeNextPath(path)).toBeNull());

  it("refuses anything that is not one string", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(["/islamabad", "https://evil.example"])).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });

  it("the create form refuses a foreign next and takes a local one", () => {
    const form = (next: string) => panelInviteCreateInput.safeParse({ label: "Group", next });
    expect(form("https://evil.example").success).toBe(false);
    expect(form("//evil.example").success).toBe(false);
    expect(form("/islamabad/best-pizza?rate=1").success).toBe(true);
    expect(panelInviteCreateInput.safeParse({ label: "Group" }).success).toBe(true);
  });
});
