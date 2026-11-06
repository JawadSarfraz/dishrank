// Panel invite links (docs/07 §7a, test DB): grant, limits, revoke, and the sign-in hooks.
import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { setPanel } from "@/server/services/admin-users.service";
import {
  PANEL_INVITE,
  createPanelInvite,
  getJoinPageState,
  getPanelInviteState,
  listPanelInvites,
  redeemPanelInvite,
  revokePanelInvite,
} from "@/server/services/panel-invite.service";
import { resetAppData } from "../../setup/db-reset";
import { ADMIN, USER, actorOf, makeDish, makeRestaurant, makeUser } from "../restaurants/fixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The hooks are about the private beta: without an invite, a stranger is refused.
vi.mock("@/server/site", async (original) => ({
  ...(await original<typeof import("@/server/site")>()),
  SITE_MODE: "beta",
}));

// The OAuth state of the sign-in in progress; real hooks read it from Better Auth's request state.
const oauth = vi.hoisted(() => ({ callbackURL: "/join/welcome" }));
vi.mock("better-auth/api", async (original) => ({
  ...(await original<typeof import("better-auth/api")>()),
  getOAuthState: async () => ({ callbackURL: oauth.callbackURL }),
}));

const NOW = new Date("2026-11-06T10:00:00Z");
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

let admin: typeof ADMIN;

const invite = (over: { maxUses?: number; expiresInDays?: number } = {}) =>
  createPanelInvite(admin, { label: "Food group", ...over }, NOW);

const userOf = (id: string) => db.user.findUniqueOrThrow({ where: { id } });

describe("panel invite links (test DB)", () => {
  beforeEach(async () => {
    await resetAppData();
    const user = await makeUser("Admin");
    admin = { ...ADMIN, id: user.id };
  });
  afterAll(() => db.$disconnect());

  it("checks the role itself (rule 6)", async () => {
    const { invite: row } = await invite();
    const form = { label: "x" };
    await expect(createPanelInvite(USER, form)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPanelInvite(null, form)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(listPanelInvites(USER)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revokePanelInvite(USER, row.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stores only the token's hash; defaults are 30 uses and 14 days", async () => {
    const { invite: row, token } = await invite();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await db.panelInvite.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored).toMatchObject({ maxUses: 30, usesCount: 0, expiresAt: later(14) });
    expect(stored.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(PANEL_INVITE).toMatchObject({ maxUses: 30, days: 14 });
  });

  it("joining makes a panel member with trust 1.3, recomputes their rows, and is listed", async () => {
    const { invite: row, token } = await invite();
    const diner = await makeUser("Diner");
    const restaurant = await makeRestaurant("Fixture Grill");
    const dish = await makeDish(restaurant, "pizza");
    await db.rating.create({ data: { restaurantDishId: dish.id, userId: diner.id, score: 8 } });

    const result = await redeemPanelInvite(diner.id, token, NOW);
    expect(result.outcome).toBe("joined");
    expect(result.dishPages).toMatchObject([{ dishSlug: "pizza" }]);
    expect(await userOf(diner.id)).toMatchObject({ isPanel: true, trustScore: 1.3 });
    expect(
      (await db.restaurantDish.findUniqueOrThrow({ where: { id: dish.id } })).weightSum,
    ).toBeCloseTo(1.3, 2);

    const [listed] = await listPanelInvites(admin, NOW);
    expect(listed).toMatchObject({ id: row.id, state: "usable", usesCount: 1 });
    expect(listed!.uses).toMatchObject([{ user: { id: diner.id, name: "Diner" } }]);
  });

  it("an admin's trust override still wins over the panel's 1.3", async () => {
    const { token } = await invite();
    const diner = await makeUser("Diner", { trustOverride: 0.4, trustScore: 0.4 });
    await redeemPanelInvite(diner.id, token, NOW);
    expect(await userOf(diner.id)).toMatchObject({ isPanel: true, trustScore: 0.4 });
  });

  it("the same person twice, or someone already on the panel, does not use up a place", async () => {
    const { invite: row, token } = await invite({ maxUses: 2 });
    const diner = await makeUser("Diner");
    expect((await redeemPanelInvite(diner.id, token, NOW)).outcome).toBe("joined");
    expect((await redeemPanelInvite(diner.id, token, NOW)).outcome).toBe("already");
    const member = await makeUser("Member", { isPanel: true, trustScore: 1.3 });
    expect((await redeemPanelInvite(member.id, token, NOW)).outcome).toBe("already");
    expect(await db.panelInvite.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      usesCount: 1,
    });
    expect(await db.panelInviteUse.count()).toBe(1);
  });

  it("the limit holds, also when people sign in at the same moment", async () => {
    const { invite: row, token } = await invite({ maxUses: 2 });
    const users = await Promise.all(["A", "B", "C", "D", "E"].map((n) => makeUser(n)));
    const results = await Promise.all(users.map((u) => redeemPanelInvite(u.id, token, NOW)));
    const outcomes = results.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(["full", "full", "full", "joined", "joined"]);
    expect(await db.panelInvite.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      usesCount: 2,
    });
    expect(await db.user.count({ where: { isPanel: true } })).toBe(2);
    expect(await getPanelInviteState(token, NOW)).toBe("full");
  });

  it("revoked and expired links stop new joins; people who joined stay on the panel", async () => {
    const { invite: row, token } = await invite();
    const early = await makeUser("Early");
    await redeemPanelInvite(early.id, token, NOW);
    await revokePanelInvite(admin, row.id, NOW);
    const late = await makeUser("Late");
    expect((await redeemPanelInvite(late.id, token, NOW)).outcome).toBe("revoked");
    expect(await userOf(late.id)).toMatchObject({ isPanel: false, trustScore: 0.6 });
    expect(await userOf(early.id)).toMatchObject({ isPanel: true, trustScore: 1.3 });
    // Revoking again keeps the first date.
    await revokePanelInvite(admin, row.id, later(1));
    expect((await db.panelInvite.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).toEqual(
      NOW,
    );

    const short = await invite({ expiresInDays: 1 });
    expect(await getPanelInviteState(short.token, later(0.5))).toBe("usable");
    expect(await getPanelInviteState(short.token, later(1))).toBe("expired");
    expect((await redeemPanelInvite(late.id, short.token, later(1))).outcome).toBe("expired");

    await expect(revokePanelInvite(admin, "nosuchinvite")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses a banned account and an unknown token", async () => {
    const { token } = await invite();
    const banned = await makeUser("Banned", { bannedAt: NOW });
    expect((await redeemPanelInvite(banned.id, token, NOW)).outcome).toBe("banned");
    expect(await userOf(banned.id)).toMatchObject({ isPanel: false });
    const diner = await makeUser("Diner");
    expect((await redeemPanelInvite(diner.id, "x".repeat(43), NOW)).outcome).toBe("unknown");
    expect(await getJoinPageState(actorOf({ ...banned, role: "USER" }), token, NOW)).toMatchObject({
      kind: "closed",
    });
  });

  it("an admin's panel off holds against every link, until the admin turns it on again", async () => {
    const first = await invite();
    const second = await invite();
    const diner = await makeUser("Diner");
    await redeemPanelInvite(diner.id, first.token, NOW);
    await setPanel(admin, diner.id, false);

    expect((await redeemPanelInvite(diner.id, first.token, NOW)).outcome).toBe("removed");
    expect((await redeemPanelInvite(diner.id, second.token, NOW)).outcome).toBe("removed");
    expect(await userOf(diner.id)).toMatchObject({ isPanel: false, trustScore: 0.6 });
    expect(
      await getJoinPageState(actorOf({ ...diner, role: "USER" }), second.token, NOW),
    ).toMatchObject({ kind: "closed" });
    expect(
      (await db.panelInvite.findUniqueOrThrow({ where: { id: second.invite.id } })).usesCount,
    ).toBe(0);

    await setPanel(admin, diner.id, true);
    expect((await userOf(diner.id)).panelRemovedAt).toBeNull();
    await setPanel(admin, diner.id, false);
    await setPanel(admin, diner.id, true);
    expect((await redeemPanelInvite(diner.id, second.token, NOW)).outcome).toBe("already");

    // Someone who was never on the panel is not marked as removed.
    const other = await makeUser("Other");
    await setPanel(admin, other.id, false);
    expect((await redeemPanelInvite(other.id, second.token, NOW)).outcome).toBe("joined");
  });

  describe("the sign-in hooks", () => {
    const hooks = auth.options.databaseHooks!;
    const newAccount = (email: string, emailVerified = true) =>
      ({ email, emailVerified, name: "New" }) as never;
    const ctxWith = (token: string | null) => {
      const setCookie = vi.fn();
      return {
        setCookie,
        ctx: {
          getCookie: (key: string) => (key === PANEL_INVITE.cookie ? token : null),
          setCookie,
        } as never,
      };
    };

    it("only a sign-in that started from the join page counts: a stale cookie gives nothing", async () => {
      const { token } = await createPanelInvite(admin, { label: "Now" });
      oauth.callbackURL = "/";
      try {
        await expect(
          hooks.user!.create!.before!(newAccount("bob@test.local"), ctxWith(token).ctx),
        ).rejects.toMatchObject({ body: { code: "BETA_INVITE_ONLY" } });
        const bob = await makeUser("Bob");
        const { ctx, setCookie } = ctxWith(token);
        await hooks.session!.create!.after!({ userId: bob.id } as never, ctx);
        expect(await userOf(bob.id)).toMatchObject({ isPanel: false, trustScore: 0.6 });
        // The stale cookie goes, so it cannot wait for someone else.
        expect(setCookie).toHaveBeenCalledWith(
          PANEL_INVITE.cookie,
          "",
          expect.objectContaining({ maxAge: 0 }),
        );
      } finally {
        oauth.callbackURL = "/join/welcome";
      }
    });

    it("a stranger is refused in beta; a usable link lets a verified account in", async () => {
      const { token } = await invite();
      const before = hooks.user!.create!.before!;
      await expect(before(newAccount("a@test.local"), ctxWith(null).ctx)).rejects.toMatchObject({
        body: { code: "BETA_INVITE_ONLY" },
      });
      await expect(
        before(newAccount("b@test.local", false), ctxWith(token).ctx),
      ).rejects.toMatchObject({ body: { code: "BETA_INVITE_ONLY" } });
      await expect(before(newAccount("c@test.local"), ctxWith(token).ctx)).resolves.toMatchObject({
        data: { email: "c@test.local" },
      });
      await expect(
        before(newAccount("d@test.local"), ctxWith("not a token").ctx),
      ).rejects.toMatchObject({ body: { code: "BETA_INVITE_ONLY" } });
    });

    it("a revoked link lets nobody in", async () => {
      const { invite: row, token } = await invite();
      await revokePanelInvite(admin, row.id, new Date());
      await expect(
        hooks.user!.create!.before!(newAccount("a@test.local"), ctxWith(token).ctx),
      ).rejects.toMatchObject({ body: { code: "BETA_INVITE_ONLY" } });
    });

    it("a sign-in through the link grants the panel and clears the cookie; without one, nothing", async () => {
      const { token } = await createPanelInvite(admin, { label: "Now" });
      const diner = await makeUser("Diner");
      const session = { userId: diner.id } as never;

      await hooks.session!.create!.after!(session, ctxWith(null).ctx);
      expect(await userOf(diner.id)).toMatchObject({ isPanel: false });

      const { ctx, setCookie } = ctxWith(token);
      await hooks.session!.create!.after!(session, ctx);
      expect(await userOf(diner.id)).toMatchObject({ isPanel: true, trustScore: 1.3 });
      expect(setCookie).toHaveBeenCalledWith(
        PANEL_INVITE.cookie,
        "",
        expect.objectContaining({ maxAge: 0 }),
      );
    });

    it("a banned e-mail stays refused even with a usable link", async () => {
      const { token } = await invite();
      const { emailHash } = await import("@/server/email-hash");
      await db.bannedEmail.create({ data: { emailHash: emailHash("gone@test.local") } });
      await expect(
        hooks.user!.create!.before!(newAccount("gone@test.local"), ctxWith(token).ctx),
      ).rejects.toMatchObject({ body: { code: "ACCOUNT_BANNED" } });
    });
  });
});
