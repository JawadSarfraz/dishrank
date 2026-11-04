import { afterEach, describe, expect, it, vi } from "vitest";
import { siteModeFrom, siteModeHeaders } from "@/lib/site-mode";
import { newAccountDecision, robotsFor } from "@/server/site";
import nextConfig from "../../../next.config";

describe("SITE_MODE (private beta)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is beta in production unless set to exactly live; live elsewhere unless set to beta", () => {
    expect(siteModeFrom({ NODE_ENV: "production" })).toBe("beta");
    expect(siteModeFrom({ NODE_ENV: "production", SITE_MODE: "live" })).toBe("live");
    for (const typo of ["Live", "LIVE", "public", ""]) {
      expect(siteModeFrom({ NODE_ENV: "production", SITE_MODE: typo })).toBe("beta");
    }
    expect(siteModeFrom({ NODE_ENV: "development" })).toBe("live");
    expect(siteModeFrom({ NODE_ENV: "test", SITE_MODE: "beta" })).toBe("beta");
  });

  it("beta: every response says noindex and robots.txt disallows everything; live does not", () => {
    expect(siteModeHeaders("beta")).toEqual([
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ]);
    expect(siteModeHeaders("live")).toEqual([]);
    expect(robotsFor("beta")).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    const live = robotsFor("live");
    expect(live.rules).toMatchObject({ allow: "/", disallow: expect.arrayContaining(["/admin"]) });
    expect(live.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("next.config.ts sends X-Robots-Tag on every path in a production build unless SITE_MODE=live", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_MODE", "");
    // Security headers come first on every path (security-surface.test.ts); here only the robots one.
    const robots = async () =>
      (await nextConfig.headers!()).filter((h) => h.headers.some((x) => x.key === "X-Robots-Tag"));
    expect(await robots()).toEqual(siteModeHeaders("beta"));
    vi.stubEnv("SITE_MODE", "live");
    expect(await robots()).toEqual([]);
  });

  it("beta: only verified, invited Google accounts and the admin get an account; live: anyone", () => {
    const beta = { mode: "beta" as const, adminEmail: "Owner@Gmail.com" };
    const invited = " panel.one@gmail.com, Panel.Two@gmail.com;panel3@gmail.com ";
    const google = (email: string, emailVerified = true) => ({ email, emailVerified });
    const decide = (email: string, input: Parameters<typeof newAccountDecision>[1]) =>
      newAccountDecision(google(email), input);
    expect(decide("panel.two@gmail.com", { ...beta, allowed: invited })).toEqual({
      allowed: true,
      admin: false,
    });
    expect(decide("panel3@gmail.com", { ...beta, allowed: invited }).allowed).toBe(true);
    expect(decide("stranger@gmail.com", { ...beta, allowed: invited }).allowed).toBe(false);
    expect(decide("owner@gmail.com", beta)).toEqual({ allowed: true, admin: true }); // no list
    expect(decide("panel.one@gmail.com", beta).allowed).toBe(false);
    // An e-mail Google has not verified never gets in during beta, and never becomes admin.
    expect(
      newAccountDecision(google("panel3@gmail.com", false), { ...beta, allowed: invited }),
    ).toEqual({ allowed: false, admin: false });
    expect(
      newAccountDecision(google("owner@gmail.com", false), {
        mode: "live",
        adminEmail: "owner@gmail.com",
      }),
    ).toEqual({
      allowed: true,
      admin: false,
    });
    expect(decide("stranger@gmail.com", { mode: "live" })).toEqual({ allowed: true, admin: false });
  });
});
