// MenuService (docs/07 §3): menu photos → dishes.
//   submit: a photo the browser uploaded to the private menus bucket → MenuUpload PENDING
//   parse:  photo → Anthropic vision (src/server/vision) → MenuItem rows → matching (docs/05) →
//           ≥ 0.85: RestaurantDish MENU_VERIFIED · lower: UNMATCHED_MENU_ITEM review item
// Triggers: "Parse now" on /admin/menus/[id], `pnpm menu:parse -- --upload=<id>` and the nightly
// /api/cron/parse-menus (≤ 20 PENDING a night). Every attempt is a MenuParse row with its tokens; at
// most 50 start in any 24 hours. Without ANTHROPIC_API_KEY and ANTHROPIC_VISION_MODEL uploads still
// work and parsing waits. Anthropic receives only the photo and the prompts, never who uploaded it.
import { env } from "@/env";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import {
  countItemsByStatus,
  countItemsWithStatus,
  countMenuParsesSince,
  countMenuUploadsByStatus,
  findMenuItemForDecision,
  findMenuUploadForAdmin,
  findMenuUploadForParse,
  findRunningMenuParse,
  finishMenuParse,
  insertMenuItem,
  insertMenuParse,
  insertMenuUpload,
  listMatchedItemsOfDish,
  listMenuUploadsPage,
  listPendingMenuUploadIds,
  lockMenuParses,
  lockMenuUpload,
  updateMenuItem,
  updateMenuUpload,
} from "@/server/repositories/menu.repo";
import { createReviewItem } from "@/server/repositories/moderation.repo";
import { startExclusiveJobRun } from "@/server/repositories/nightly.repo";
import { finishJobRun } from "@/server/repositories/ops.repo";
import {
  ensureRestaurantDish,
  findDishRowForMenu,
  listDishPagesOfRows,
  lockRestaurantDishes,
  updateDishRowFromMenu,
} from "@/server/repositories/restaurant-dish.repo";
import { findRestaurantById, lockRestaurantForRating } from "@/server/repositories/restaurant.repo";
import {
  findDishById,
  listDishCategories,
  listDishesForPicker,
} from "@/server/repositories/taxonomy.repo";
import { inTransaction, isUniqueViolation, type Tx } from "@/server/repositories/transaction";
import { assertRole, type SessionUser } from "@/server/roles";
import { getStorage, type StorageAdapter } from "@/server/storage";
import type { MenuUploadInput, MenuUploadsQuery } from "@/server/validation";
import {
  createMenuVision,
  MenuVisionError,
  toMenuItems,
  type MenuImage,
  type MenuVision,
  type TokenUsage,
} from "@/server/vision";
import { assertMenuUploader, menuUploaderRole } from "./menu-access";
import { matchDish, type MatchDeps, type MatchResult } from "./matching";
import { getAliasIndex } from "./matching/aliases";
import { createLlmMatcher, type LlmMatcher } from "./matching/llm";
import { normalize, tokenize } from "./matching/normalize";
import { tagsInText } from "./matching/tags";
import { DAY_MS } from "./ranking.constants";
import { recomputeEach } from "./ranking.service";
import { reviewFingerprint } from "./review-fingerprint";
import { isAcceptedPhoto, MENU_PREFIX, UPLOAD } from "./upload.service";

export const MENU_PARSE = {
  /** Owner's Phase 5 rule: at most 50 parses start in any 24 hours, whatever triggers them. */
  // DECISION-PENDING: "per day" is a rolling 24 hours, not the Pakistan calendar day.
  dailyCap: 50,
  /** The nightly job parses at most this many PENDING uploads (docs/07 §3)… */
  nightlyLimit: 20,
  /** …and starts no new parse after this long, within the route's 300 s. */
  nightlyBudgetMs: 200_000,
  /** An unfinished attempt older than this is taken as dead (the function timed out). */
  runningMs: 10 * 60_000,
  /** LLM matcher calls (docs/05 step 5) per parse; items past it go to review with suggestions. */
  // DECISION-PENDING: 25 calls a parse bounds the matcher's cost on a long menu.
  maxMatchCalls: 25,
} as const;

export const MENU_PARSE_JOB = "parse-menus";

export type ParseTrigger = "admin" | "cli" | "cron";

export type MenuParseDeps = {
  storage?: StorageAdapter | null;
  /** null: parsing is not set up. Default: Anthropic with ANTHROPIC_VISION_MODEL. */
  vision?: MenuVision | null;
  /** The matcher's LLM step for one parse, given its usage counter. Default: ANTHROPIC_MATCH_MODEL. */
  llm?: (onUsage: (usage: TokenUsage) => void) => LlmMatcher | null;
  aliasIndex?: MatchDeps["aliasIndex"];
  trigram?: MatchDeps["trigram"];
};

const defaultVision = () =>
  createMenuVision({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_VISION_MODEL });

const defaultLlm = (onUsage: (usage: TokenUsage) => void) =>
  createLlmMatcher({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MATCH_MODEL, onUsage });

/** Parsing runs only with both ANTHROPIC_API_KEY and ANTHROPIC_VISION_MODEL. */
export function menuParsingEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_VISION_MODEL);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ---------- upload ----------

/** Whether the signed-in user may upload a menu photo here (the restaurant page's button). */
export async function getMenuUploadAccess(actor: SessionUser | null, restaurantId: string) {
  if (!actor) return { allowed: false };
  return { allowed: (await menuUploaderRole(actor, restaurantId)) !== null };
}

/**
 * docs/07 §3 step 1: the photo the browser put at a signed URL → MenuUpload PENDING. The path must
 * be this user's upload for this restaurant (menus/<restaurantId>/<userId>/<random>.<jpg|webp>),
 * present in storage, ≤ 5 MB and JPEG or WebP. Limit: user:{id}:menu-upload.
 */
export async function submitMenuUpload(
  actor: SessionUser | null,
  input: MenuUploadInput,
  storage: StorageAdapter | null = getStorage(),
  now: Date = new Date(),
) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  await assertMenuUploader(user, input.restaurantId);
  await assertRateLimit(`user:${user.id}:menu-upload`, RATE_LIMITS.menuUpload, now);
  const folder = `${MENU_PREFIX}${input.restaurantId}/${user.id}/`;
  const extensions = Object.values(UPLOAD.extensions).join("|");
  if (
    !input.path.startsWith(folder) ||
    !new RegExp(`^[a-f0-9]{32}\\.(${extensions})$`).test(input.path.slice(folder.length))
  ) {
    throw new AppError("PHOTO_NOT_YOURS", "That photo was not uploaded by you for this menu", 400);
  }
  if (!storage) throw new AppError("UPLOADS_DISABLED", "Photo uploads are not set up yet", 400);
  const object = await storage.inspect({
    bucket: env.SUPABASE_MENUS_BUCKET,
    key: input.path.slice(MENU_PREFIX.length),
  });
  if (!object) throw new AppError("PHOTO_NOT_FOUND", "The photo did not finish uploading", 400);
  if (!isAcceptedPhoto(object)) {
    throw new AppError(
      "PHOTO_INVALID",
      "The photo must be a JPEG or WebP image of 5 MB or less",
      400,
    );
  }
  let upload;
  try {
    upload = await insertMenuUpload({
      restaurantId: input.restaurantId,
      uploadedByUserId: user.id,
      filePath: input.path,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("MENU_ALREADY_SUBMITTED", "This photo was sent already", 409);
    }
    throw error;
  }
  logEvent("menu.upload", {
    userId: user.id,
    entityId: upload.id,
    restaurantId: input.restaurantId,
    bytes: object.size,
  });
  return { id: upload.id, status: upload.status, parsingEnabled: menuParsingEnabled() };
}

// ---------- dish rows from a menu ----------

type MenuEvidence = { rawName: string; rawPrice: number | null; variantTags: string[] };

/**
 * docs/07 §3: what a menu photo changes on a dish row, given the upload's items of that dish in
 * menu order: MENU_VERIFIED, menuName = the first item's name, price = the lowest printed price
 * (Half below Full), the items' variant tags, lastVerifiedAt now. An owner-verified row keeps the
 * owner's data and only counts as seen again; a removed row stays removed (only an admin revives
 * one, docs/06). A missing price or tag list keeps the row's own.
 */
// DECISION-PENDING: an existing row keeps its source; OWNER_VERIFIED and REMOVED rows are not changed.
export function menuVerification(
  row: { status: string; confidence: number },
  items: readonly MenuEvidence[],
  confidence: number,
  now: Date,
): Prisma.RestaurantDishUncheckedUpdateInput | null {
  if (row.status === "REMOVED" || items.length === 0) return null;
  if (row.status === "OWNER_VERIFIED") return { lastVerifiedAt: now };
  const prices = items.map((i) => i.rawPrice).filter((p): p is number => p !== null);
  const tags = [...new Set(items.flatMap((i) => i.variantTags))].sort();
  return {
    status: "MENU_VERIFIED",
    confidence: Math.max(row.confidence, confidence),
    menuName: items[0]!.rawName,
    ...(prices.length > 0 ? { price: Math.min(...prices) } : {}),
    ...(tags.length > 0 ? { variantTags: tags } : {}),
    lastVerifiedAt: now,
  };
}

/** Creates (source MENU_PHOTO) or upgrades one dish row from these items; returns its id. */
async function verifyDishFromMenu(
  input: { restaurantId: string; cityId: string; dishId: string; confidence: number },
  items: readonly MenuEvidence[],
  now: Date,
  tx: Tx,
) {
  const ensured = await ensureRestaurantDish(
    {
      restaurantId: input.restaurantId,
      dishId: input.dishId,
      cityId: input.cityId,
      source: "MENU_PHOTO",
      confidence: input.confidence,
    },
    tx,
  );
  await lockRestaurantDishes([ensured.id], tx);
  const row = await findDishRowForMenu(ensured.id, tx);
  const data = menuVerification(row, items, input.confidence, now);
  if (data) await updateDishRowFromMenu(row.id, data, tx);
  return { id: row.id, changed: data !== null, created: ensured.created };
}

// ---------- parse ----------

export type ParseOutcome = {
  uploadId: string;
  status: "PARSED" | "REVIEWED" | "FAILED";
  items: number;
  matched: number;
  needsReview: number;
  error: string | null;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    matchCalls: number;
    matchInputTokens: number;
    matchOutputTokens: number;
  };
  /** Ranking and restaurant pages of the dish rows the parse changed (to revalidate). */
  dishPages: { citySlug: string; dishSlug: string; restaurantSlug: string }[];
};

/** Claims the upload for one parse attempt: the daily cap and one parse per upload at a time. */
async function claimParse(uploadId: string, trigger: ParseTrigger, model: string, now: Date) {
  return inTransaction(async (tx) => {
    await lockMenuParses(tx);
    const upload = await findMenuUploadForParse(uploadId, tx);
    if (!upload) throw new AppError("NOT_FOUND", "Menu upload not found", 404);
    if (upload.status !== "PENDING" && upload.status !== "FAILED") {
      throw new AppError("MENU_ALREADY_PARSED", "This menu photo was read already", 409);
    }
    if (await findRunningMenuParse(uploadId, new Date(now.getTime() - MENU_PARSE.runningMs), tx)) {
      throw new AppError("PARSE_RUNNING", "This menu photo is being read right now", 409);
    }
    const today = await countMenuParsesSince(new Date(now.getTime() - DAY_MS), tx);
    if (today >= MENU_PARSE.dailyCap) {
      throw new AppError(
        "DAILY_CAP_REACHED",
        `${MENU_PARSE.dailyCap} menu photos were read in the last 24 hours, the most allowed. Try again later.`,
        429,
      );
    }
    const attempt = await insertMenuParse(
      { menuUploadId: uploadId, trigger, model, startedAt: now },
      tx,
    );
    return { upload, attemptId: attempt.id };
  });
}

/** The photo's bytes as the vision model takes them; never anything about who uploaded it. */
async function loadImage(filePath: string, storage: StorageAdapter): Promise<MenuImage> {
  const object = await storage.download({
    bucket: env.SUPABASE_MENUS_BUCKET,
    key: filePath.slice(MENU_PREFIX.length),
  });
  if (!object) throw new AppError("PHOTO_NOT_FOUND", "The photo is missing from storage", 400);
  const mediaType = object.contentType.split(";")[0];
  if (
    object.data.byteLength > UPLOAD.maxBytes ||
    (mediaType !== "image/jpeg" && mediaType !== "image/webp")
  ) {
    throw new AppError(
      "PHOTO_INVALID",
      "The photo must be a JPEG or WebP image of 5 MB or less",
      400,
    );
  }
  return { data: object.data, mediaType };
}

/**
 * docs/07 §3 step 2 for one upload (PENDING or FAILED). Refusals throw before any API call:
 * PARSING_DISABLED / UPLOADS_DISABLED (503), NOT_FOUND, MENU_ALREADY_PARSED, PARSE_RUNNING (409),
 * DAILY_CAP_REACHED (429). A parse that started and failed (storage, the API, no items) is recorded
 * and answers status FAILED with the error, which is kept on the upload.
 */
export async function parseMenuUpload(
  uploadId: string,
  options: { trigger: ParseTrigger; now?: Date; maxMatchCalls?: number },
  deps: MenuParseDeps = {},
): Promise<ParseOutcome> {
  const now = options.now ?? new Date();
  const vision = deps.vision === undefined ? defaultVision() : deps.vision;
  if (!vision) {
    throw new AppError(
      "PARSING_DISABLED",
      "Menu parsing is not set up (ANTHROPIC_API_KEY and ANTHROPIC_VISION_MODEL)",
      503,
    );
  }
  const storage = deps.storage === undefined ? getStorage() : deps.storage;
  if (!storage) throw new AppError("UPLOADS_DISABLED", "Photo storage is not set up", 503);

  const { upload, attemptId } = await claimParse(uploadId, options.trigger, vision.model, now);
  const started = Date.now();
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    matchCalls: 0,
    matchInputTokens: 0,
    matchOutputTokens: 0,
  };
  const outcome = (o: Partial<ParseOutcome> & Pick<ParseOutcome, "status">): ParseOutcome => ({
    uploadId,
    items: 0,
    matched: 0,
    needsReview: 0,
    error: null,
    model: vision.model,
    usage,
    dishPages: [],
    ...o,
  });
  let raw: unknown = undefined;

  const readAndWrite = async () => {
    // 1. The photo → the model's menu.
    const read = await vision.read(await loadImage(upload.filePath, storage));
    raw = read.raw;
    usage.inputTokens = read.usage.inputTokens;
    usage.outputTokens = read.usage.outputTokens;
    const { items, dropped } = toMenuItems(raw);
    if (dropped > 0) logEvent("menu.parse.items_dropped", { entityId: uploadId, dropped }, "warn");
    // DECISION-PENDING: a photo with no items (not a menu, unreadable) fails, so an admin sees it.
    if (items.length === 0) {
      throw new AppError("NO_ITEMS", "No menu items were found in the photo", 422);
    }

    // 2. Matching (docs/05), outside any transaction: the LLM step is a network call.
    const maxCalls = options.maxMatchCalls ?? MENU_PARSE.maxMatchCalls;
    const counted = (deps.llm ?? defaultLlm)((u) => {
      usage.matchInputTokens += u.inputTokens;
      usage.matchOutputTokens += u.outputTokens;
    });
    const llm: LlmMatcher | null = counted
      ? async (input) => {
          if (usage.matchCalls >= maxCalls) return null;
          usage.matchCalls++;
          return counted(input);
        }
      : null;
    const matches: MatchResult[] = [];
    for (const item of items) {
      matches.push(
        await matchDish(
          item.rawName,
          { section: item.rawSection ?? undefined, allowLlm: true },
          { llm, aliasIndex: deps.aliasIndex, trigram: deps.trigram },
        ),
      );
    }

    // 3. One transaction: dish rows, items, review items, the upload, the attempt.
    const written = await inTransaction(async (tx) => {
      // Share-locks the restaurant like a rating does: a merge or status change waits for this.
      const restaurant = await lockRestaurantForRating(upload.restaurantId, tx);
      const current = await findMenuUploadForParse(uploadId, tx);
      if (!restaurant || restaurant.status === "DUPLICATE" || !current) {
        throw new AppError(
          "RESTAURANT_MERGED",
          "The restaurant was merged meanwhile; parse again",
          409,
        );
      }
      const byDish = new Map<string, { evidence: MenuEvidence[]; confidence: number }>();
      items.forEach((item, i) => {
        const m = matches[i]!;
        if (m.decision !== "auto" || !m.dishId) return;
        const group = byDish.get(m.dishId) ?? { evidence: [], confidence: 0 };
        group.evidence.push({ ...item, variantTags: m.variantTags });
        group.confidence = Math.max(group.confidence, m.confidence);
        byDish.set(m.dishId, group);
      });
      // Dish order, so two parses of one restaurant create and lock rows in the same order.
      const rows: string[] = [];
      for (const dishId of [...byDish.keys()].sort()) {
        const group = byDish.get(dishId)!;
        const row = await verifyDishFromMenu(
          {
            restaurantId: upload.restaurantId,
            cityId: upload.restaurant.cityId,
            dishId,
            confidence: group.confidence,
          },
          group.evidence,
          now,
          tx,
        );
        if (row.changed) rows.push(row.id);
      }
      let needsReview = 0;
      for (const [i, item] of items.entries()) {
        const m = matches[i]!;
        const auto = m.decision === "auto" && m.dishId !== null;
        const created = await insertMenuItem(
          {
            menuUploadId: uploadId,
            position: i,
            ...item,
            // docs/05 step 6: for an item that needs review these describe its first suggestion.
            matchedDishId: m.dishId,
            matchConfidence: m.dishId ? m.confidence : null,
            matchMethod: m.method,
            variantTags: m.variantTags,
            status: auto ? "MATCHED" : "NEEDS_REVIEW",
          },
          tx,
        );
        if (auto) continue;
        needsReview++;
        const review = await createReviewItem(
          {
            type: "UNMATCHED_MENU_ITEM",
            payload: {
              menuItemId: created.id,
              menuUploadId: uploadId,
              rawName: item.rawName,
              rawPrice: item.rawPrice,
              rawSection: item.rawSection,
              suggestions: m.candidates.map((c) => ({ dishSlug: c.dishSlug, conf: c.confidence })),
            },
            restaurantId: upload.restaurantId,
            createdByUserId: upload.uploadedByUserId,
          },
          tx,
        );
        await updateMenuItem(created.id, { reviewItemId: review.id }, tx);
      }
      // Every item resolved (all matched automatically) → REVIEWED at once (docs/07 §3 step 4).
      // DECISION-PENDING: no admin look is required for an upload whose items all matched.
      const status = needsReview === 0 ? ("REVIEWED" as const) : ("PARSED" as const);
      await updateMenuUpload(
        uploadId,
        { status, rawJson: raw as Prisma.InputJsonValue, parsedAt: now, error: null },
        tx,
      );
      await finishMenuParse(attemptId, { ok: true, finishedAt: new Date(), ...usage }, tx);
      return { rows, needsReview, status };
    });

    return { ...written, items: items.length };
  };

  let written;
  try {
    written = await readAndWrite();
  } catch (error) {
    // Our own messages only; anything else is logged and stored as a generic error.
    const known = error instanceof AppError || error instanceof MenuVisionError;
    const reason = known ? message(error) : "Internal error while reading the menu";
    if (error instanceof MenuVisionError) {
      usage.inputTokens = error.usage.inputTokens;
      usage.outputTokens = error.usage.outputTokens;
    }
    await updateMenuUpload(uploadId, {
      status: "FAILED",
      error: reason.slice(0, 500),
      ...(raw !== undefined ? { rawJson: raw as Prisma.InputJsonValue } : {}),
    });
    await finishMenuParse(attemptId, {
      ok: false,
      error: reason.slice(0, 500),
      finishedAt: new Date(),
      ...usage,
    });
    logEvent(
      "menu.parse",
      {
        entityId: uploadId,
        trigger: options.trigger,
        status: "FAILED",
        error: known ? reason : message(error),
        model: vision.model,
        ...usage,
        durationMs: Date.now() - started,
      },
      "error",
    );
    return outcome({ status: "FAILED", error: reason });
  }

  // 4. After commit, never failing the parse: scores and ranks of the changed rows (a menu
  // verification can make a dish row eligible), then the pages to revalidate.
  await recomputeEach(written.rows, now);
  const result = outcome({
    status: written.status,
    items: written.items,
    matched: written.items - written.needsReview,
    needsReview: written.needsReview,
    dishPages: await listDishPagesOfRows(written.rows).catch(() => []),
  });
  logEvent("menu.parse", {
    entityId: uploadId,
    trigger: options.trigger,
    status: result.status,
    items: result.items,
    matched: result.matched,
    needsReview: result.needsReview,
    rowsChanged: written.rows.length,
    model: vision.model,
    ...usage,
    durationMs: Date.now() - started,
  });
  return result;
}

/** "Parse now" on /admin/menus/[id]. */
export async function parseMenuNow(actor: SessionUser | null, uploadId: string) {
  const admin = assertRole(actor, "ADMIN");
  logEvent("admin.menu.parse", { userId: admin.id, entityId: uploadId });
  return parseMenuUpload(uploadId, { trigger: "admin" });
}

export type MenuJobSummary = {
  trigger: ParseTrigger;
  enabled: boolean;
  considered: number;
  parsed: number;
  failed: number;
  skipped: number;
  deferred: number;
  capReached: boolean;
  inputTokens: number;
  outputTokens: number;
  matchCalls: number;
  durationMs: number;
};

/**
 * The nightly parse (/api/cron/parse-menus): up to 20 PENDING uploads, oldest first, one at a time,
 * starting none after the time budget; it stops at the daily cap. Without the Anthropic variables it
 * parses nothing and the uploads wait. One JobRun per run; refuses while another run is going.
 */
export async function parsePendingMenus(
  options: { trigger: ParseTrigger; now?: Date; limit?: number },
  deps: MenuParseDeps = {},
) {
  const now = options.now ?? new Date();
  const started = Date.now();
  const job = await startExclusiveJobRun(MENU_PARSE_JOB, now, 30 * 60_000);
  if (!job) throw new AppError("JOB_RUNNING", "This job is already running. Try again later.", 409);
  const vision = deps.vision === undefined ? defaultVision() : deps.vision;
  const summary: MenuJobSummary = {
    trigger: options.trigger,
    enabled: vision !== null,
    considered: 0,
    parsed: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
    capReached: false,
    inputTokens: 0,
    outputTokens: 0,
    matchCalls: 0,
    durationMs: 0,
  };
  const pages: ParseOutcome["dishPages"] = [];
  try {
    const ids = vision
      ? await listPendingMenuUploadIds(options.limit ?? MENU_PARSE.nightlyLimit)
      : [];
    for (const id of ids) {
      summary.considered++;
      if (summary.capReached || Date.now() - started > MENU_PARSE.nightlyBudgetMs) {
        summary.deferred++;
        continue;
      }
      try {
        const result = await parseMenuUpload(id, { trigger: options.trigger }, { ...deps, vision });
        if (result.status === "FAILED") summary.failed++;
        else summary.parsed++;
        summary.inputTokens += result.usage.inputTokens + result.usage.matchInputTokens;
        summary.outputTokens += result.usage.outputTokens + result.usage.matchOutputTokens;
        summary.matchCalls += result.usage.matchCalls;
        pages.push(...result.dishPages);
      } catch (error) {
        if (error instanceof AppError && error.code === "DAILY_CAP_REACHED") {
          summary.capReached = true;
          summary.deferred++;
        } else if (error instanceof AppError && error.status === 409) {
          summary.skipped++; // read meanwhile, or being read by "Parse now"
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    summary.durationMs = Date.now() - started;
    await finishJobRun(job.id, {
      ok: false,
      summary: { ...summary, error: message(error) },
      finishedAt: new Date(),
    });
    logEvent("menu.parse_pending", { ok: false, error: message(error), ...summary }, "error");
    throw error;
  }
  summary.durationMs = Date.now() - started;
  await finishJobRun(job.id, { ok: true, summary, finishedAt: new Date() });
  logEvent("menu.parse_pending", { ok: true, ...summary });
  return { jobRunId: job.id, ok: true, summary, dishPages: pages };
}

// ---------- admin views ----------

export async function listMenuUploadsForAdmin(
  actor: SessionUser | null,
  query: MenuUploadsQuery,
  now: Date = new Date(),
) {
  assertRole(actor, "ADMIN");
  const take = 50;
  const [rows, counts, parsesToday] = await Promise.all([
    listMenuUploadsPage({ status: query.status, take: take + 1, cursor: query.cursor }),
    countMenuUploadsByStatus(),
    countMenuParsesSince(new Date(now.getTime() - DAY_MS)),
  ]);
  const page = rows.slice(0, take);
  const itemCounts = await countItemsByStatus(page.map((u) => u.id));
  const countOf = (uploadId: string, status: string) =>
    itemCounts.find((c) => c.menuUploadId === uploadId && c.status === status)?._count._all ?? 0;
  return {
    counts,
    parsesToday,
    dailyCap: MENU_PARSE.dailyCap,
    parsingEnabled: menuParsingEnabled(),
    nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null,
    uploads: page.map((u) => ({
      ...u,
      matched: countOf(u.id, "MATCHED"),
      needsReview: countOf(u.id, "NEEDS_REVIEW"),
      ignored: countOf(u.id, "IGNORED"),
    })),
  };
}

type ItemPayload = {
  menuItemId: string;
  menuUploadId?: string;
  suggestions?: { dishSlug: string; conf: number }[];
};

/** The upload page: a 10-minute link to the private photo, the items by group, the attempts. */
export async function getMenuUploadForAdmin(
  actor: SessionUser | null,
  uploadId: string,
  storage: StorageAdapter | null = getStorage(),
  now: Date = new Date(),
) {
  assertRole(actor, "ADMIN");
  const upload = await findMenuUploadForAdmin(uploadId);
  if (!upload) return null;
  const [dishes, categories, parsesToday] = await Promise.all([
    listDishesForPicker(),
    listDishCategories(),
    countMenuParsesSince(new Date(now.getTime() - DAY_MS)),
  ]);
  const bySlug = new Map(dishes.map((d) => [d.slug, d]));
  const photoUrl = storage
    ? await storage.signDownload({
        bucket: env.SUPABASE_MENUS_BUCKET,
        key: upload.filePath.slice(MENU_PREFIX.length),
        expiresInSeconds: UPLOAD.expiresInSeconds,
      })
    : null;
  const items = upload.items.map((item) => {
    const review = item.reviewItem;
    const payload = review?.payload as ItemPayload | undefined;
    return {
      ...item,
      review: review
        ? {
            id: review.id,
            status: review.status,
            resolution: review.resolution,
            fingerprint: reviewFingerprint(review, []),
            suggestions: (payload?.suggestions ?? []).flatMap((s) => {
              const dish = bySlug.get(s.dishSlug);
              return dish
                ? [{ dishId: dish.id, slug: dish.slug, name: dish.name, conf: s.conf }]
                : [];
            }),
          }
        : null,
    };
  });
  return {
    upload: { ...upload, items: undefined },
    photoUrl,
    matched: items.filter((i) => i.status === "MATCHED"),
    needsReview: items.filter((i) => i.status === "NEEDS_REVIEW"),
    ignored: items.filter((i) => i.status === "IGNORED"),
    dishes,
    categories,
    parsingEnabled: menuParsingEnabled(),
    parsesToday,
    dailyCap: MENU_PARSE.dailyCap,
  };
}

// ---------- review decisions (UNMATCHED_MENU_ITEM, called by review.service) ----------

/**
 * Before the review item's own lock (restaurant → dish rows → item): the restaurant's share lock
 * and, for "assign", the dish row, created when absent.
 */
export async function lockMenuItemParents(
  restaurantId: string | null,
  dishId: string | null,
  tx: Tx,
) {
  if (!restaurantId) return { rows: new Map<string, string>(), restaurantId: null };
  const restaurant = await lockRestaurantForRating(restaurantId, tx);
  const rows = new Map<string, string>();
  // An unknown dish is refused by the decision itself (NOT_FOUND), after the item's checks.
  const found = restaurant && dishId ? await findRestaurantById(restaurantId, tx) : null;
  if (found && dishId && (await findDishById(dishId, tx))) {
    const ensured = await ensureRestaurantDish(
      { restaurantId, dishId, cityId: found.cityId, source: "MENU_PHOTO", confidence: 1 },
      tx,
    );
    await lockRestaurantDishes([ensured.id], tx);
    rows.set(dishId, ensured.id);
  }
  return { rows, restaurantId };
}

/**
 * docs/07 §6 UNMATCHED_MENU_ITEM: "assign" (also after "create dish") matches the item by hand
 * (HUMAN, 1.0) and verifies the dish row from the upload's items of that dish; "ignore" marks it
 * ignored. When no item of the upload waits any more, the upload becomes REVIEWED.
 */
export async function decideMenuItemTx(
  input: { menuItemId: string; restaurantId: string; dish: { id: string; slug: string } | null },
  now: Date,
  tx: Tx,
) {
  const item = await findMenuItemForDecision(input.menuItemId, tx);
  if (!item) throw new AppError("NOT_FOUND", "The menu item no longer exists", 404);
  if (item.menuUpload.restaurantId !== input.restaurantId) {
    throw new AppError("ITEM_CHANGED", "This item changed after you opened it. Reload it.", 409);
  }
  const upload = await lockMenuUpload(item.menuUploadId, tx);
  let rowId: string | null = null;
  if (input.dish) {
    const dishInfo = (await getAliasIndex()).dishBySlug(input.dish.slug);
    await updateMenuItem(
      item.id,
      {
        matchedDishId: input.dish.id,
        matchConfidence: 1,
        matchMethod: "HUMAN",
        status: "MATCHED",
        // A dish created in this decision is not in the alias index yet: no tags then.
        variantTags: dishInfo ? tagsInText(tokenize(normalize(item.rawName)), dishInfo) : [],
      },
      tx,
    );
    const restaurant = await findRestaurantById(input.restaurantId, tx);
    if (!restaurant) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    const row = await verifyDishFromMenu(
      {
        restaurantId: input.restaurantId,
        cityId: restaurant.cityId,
        dishId: input.dish.id,
        confidence: 1,
      },
      await listMatchedItemsOfDish(item.menuUploadId, input.dish.id, tx),
      now,
      tx,
    );
    if (row.changed) rowId = row.id;
  } else {
    await updateMenuItem(item.id, { status: "IGNORED" }, tx);
  }
  if (
    upload?.status === "PARSED" &&
    (await countItemsWithStatus(item.menuUploadId, "NEEDS_REVIEW", tx)) === 0
  ) {
    await updateMenuUpload(item.menuUploadId, { status: "REVIEWED" }, tx);
  }
  return { rowId, uploadId: item.menuUploadId };
}
