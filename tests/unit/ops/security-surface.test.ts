// The security pass (docs/11 Security): static checks over the source, so a new action, handler or
// client component that skips a rule fails here.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { devOnlyRefusal } from "@/lib/dev-only";
import { securityHeaders } from "@/lib/security-headers";
import { MAX_JSON_BYTES, readJson } from "@/server/http";

const ROOT = path.resolve(__dirname, "../../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
function walk(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    return e.isDirectory() ? walk(rel) : [rel];
  });
}

/** Each exported async function of a file, with its body (up to the next top-level export). */
function exportedFunctions(source: string) {
  const parts = source.split(/\n(?=export )/);
  return parts.flatMap((part) => {
    const m = /^export async function (\w+)/.exec(part);
    return m ? [{ name: m[1]!, body: part }] : [];
  });
}

const AUTH = /\b(requireUser|requireRole)\(/;

describe("security surface (Phase 6)", () => {
  it("every server action checks the session (the anonymous ones are listed here on purpose)", () => {
    // Anyone may file a dispute (limited per IP); the menu button asks whether to show itself.
    const anonymous: Record<string, RegExp> = {
      fileDisputeAction: /getSessionUser\(/,
      menuUploadAccessAction: /getSessionUser\(/,
    };
    const files = walk("src/server/actions").filter(
      (f) => f.endsWith(".ts") && !/\/(result|index)\.ts$/.test(f),
    );
    const missing: string[] = [];
    for (const file of files) {
      const source = read(file);
      expect(source.startsWith('"use server"'), file).toBe(true);
      // A file's own `adminWriter()` helper counts when it calls requireRole("ADMIN") itself.
      const helper = /async function adminWriter\(\)[^}]*requireRole\("ADMIN"\)/.test(source);
      for (const fn of exportedFunctions(source)) {
        const viaHelper = helper && /\badminWriter\(\)/.test(fn.body);
        const ok = anonymous[fn.name]
          ? anonymous[fn.name]!.test(fn.body)
          : AUTH.test(fn.body) || viaHelper;
        if (!ok) missing.push(`${file}: ${fn.name}`);
        if (file.includes("admin-") && !/requireRole\("ADMIN"\)/.test(fn.body) && !viaHelper) {
          missing.push(`${file}: ${fn.name} (admin action without requireRole("ADMIN"))`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every /api handler checks the session, the cron secret or a per-IP limit", () => {
    const routes = walk("src/app/api").filter((f) => f.endsWith("route.ts"));
    const problems: string[] = [];
    for (const file of routes) {
      const source = read(file);
      if (file.includes("/api/auth/")) continue; // Better Auth's own handler
      if (file.includes("/api/cron/")) {
        if (!/requireCronSecret\(/.test(source)) problems.push(`${file}: no cron secret`);
        continue;
      }
      if (file.includes("/api/v1/admin/") && !/requireRole\("ADMIN"\)/.test(source)) {
        problems.push(`${file}: admin route without requireRole("ADMIN")`);
      }
      for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
        const fn = exportedFunctions(source).find((f) => f.name === method);
        if (!fn) continue;
        // Anonymous writes on purpose: /dispute (anyone) and page-view counts; both per-IP limited.
        const anonymousWrite = /\/v1\/(disputes|events)\//.test(file);
        if (!AUTH.test(fn.body) && !anonymousWrite)
          problems.push(`${file}: ${method} without auth`);
        if (anonymousWrite && !/ipHash\(/.test(fn.body)) problems.push(`${file}: no IP limit`);
      }
      const get = exportedFunctions(source).find((f) => f.name === "GET");
      // The health check's limit runs inside its 3 s budget (checkHealth), keyed by the IP hash.
      const healthCheck =
        file.endsWith(path.join("api", "health", "route.ts")) &&
        /checkHealth\(ipHash\(/.test(get?.body ?? "");
      if (get && !AUTH.test(get.body) && !/assertRateLimit\(/.test(get.body) && !healthCheck) {
        problems.push(`${file}: public GET without a rate limit`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("client components import no server code except server actions and types, and never env", () => {
    const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
    const problems: string[] = [];
    for (const file of files) {
      const source = read(file);
      if (!/^["']use client["']/.test(source)) continue;
      for (const m of source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"(@\/[^"]+)";/gm)) {
        const [, typeOnly, target] = m;
        if (target === "@/env") problems.push(`${file}: imports @/env`);
        if (
          target!.startsWith("@/server/") &&
          !typeOnly &&
          !target!.startsWith("@/server/actions/")
        ) {
          problems.push(`${file}: imports ${target}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("security headers: a basic CSP, no framing, no sniffing; HSTS on Vercel, no eval in production", () => {
    const prod = securityHeaders({
      NODE_ENV: "production",
      VERCEL: "1",
      SUPABASE_S3_ENDPOINT: "https://ref.storage.supabase.co/storage/v1/s3",
    });
    const get = (h: typeof prod, key: string) => h.find((x) => x.key === key)?.value ?? "";
    const csp = get(prod, "Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://ref.storage.supabase.co");
    expect(csp).toContain("img-src 'self' data: blob: https://ref.storage.supabase.co");
    expect(csp).not.toContain("unsafe-eval");
    expect(get(prod, "X-Content-Type-Options")).toBe("nosniff");
    expect(get(prod, "X-Frame-Options")).toBe("DENY");
    expect(get(prod, "Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(csp).toContain("upgrade-insecure-requests");
    const dev = securityHeaders({ NODE_ENV: "development" });
    expect(get(dev, "Content-Security-Policy")).toContain("'unsafe-eval'");
    expect(get(dev, "Strict-Transport-Security")).toBe("");
    // A local production build on http (e2e) gets no https-only rules.
    const local = securityHeaders({ NODE_ENV: "production" });
    expect(get(local, "Content-Security-Policy")).not.toContain("upgrade-insecure-requests");
    expect(get(local, "Strict-Transport-Security")).toBe("");
  });

  it("refuses JSON bodies over the limit, and dev-only scripts refuse production", async () => {
    const big = new Request("http://x/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "x".repeat(MAX_JSON_BYTES) }),
    });
    await expect(readJson(big)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", status: 413 });
    expect(devOnlyRefusal({ NODE_ENV: "production" })).toMatch(/production/);
    expect(devOnlyRefusal({ VERCEL: "1" })).toMatch(/Vercel/);
    expect(devOnlyRefusal({ NODE_ENV: "development" })).toBeNull();
  });
});
