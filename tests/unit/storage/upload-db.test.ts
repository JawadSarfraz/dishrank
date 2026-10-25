import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { supabaseS3Storage } from "@/server/storage";
import { presignRequest } from "@/server/storage/sigv4";
import { signPhotoUpload, UPLOAD } from "@/server/services/upload.service";
import { fitWithin } from "@/lib/image";
import { resetAppData } from "../../setup/db-reset";
import { actorOf, makeUser } from "../restaurants/fixtures";
import { fakeStorage } from "./fake-storage";

const input = {
  kind: "dish-photo" as const,
  contentType: "image/webp" as const,
  sizeBytes: 300_000,
};

describe("photo uploads (docs/06 uploads/sign)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("signs one 10-minute upload in the user's own folder, with a random file name", async () => {
    const user = await makeUser("Diner");
    const { adapter, calls } = fakeStorage();
    const signed = await signPhotoUpload(actorOf(user), input, adapter);
    expect(signed.path).toMatch(new RegExp(`^dish-photos/${user.id}/[a-f0-9]{32}\\.webp$`));
    expect(signed).toMatchObject({ method: "PUT", headers: { "content-type": "image/webp" } });
    expect(calls).toEqual([
      {
        bucket: "dish-photos",
        key: signed.path.slice("dish-photos/".length),
        contentType: "image/webp",
        expiresInSeconds: 600,
      },
    ]);
    expect(UPLOAD.expiresInSeconds).toBeLessThanOrEqual(600);
    const jpeg = await signPhotoUpload(
      actorOf(user),
      { ...input, contentType: "image/jpeg" },
      adapter,
    );
    expect(jpeg.path).toMatch(/\.jpg$/);
  });

  it("answers 503 when storage is not set up, refuses menus and anonymous users, limits 20 a day", async () => {
    const user = await makeUser("Diner");
    await expect(signPhotoUpload(actorOf(user), input, null)).rejects.toMatchObject({
      code: "UPLOADS_DISABLED",
      status: 503,
    });
    const { adapter } = fakeStorage();
    await expect(
      signPhotoUpload(actorOf(user), { ...input, kind: "menu" }, adapter),
    ).rejects.toMatchObject({
      code: "NOT_AVAILABLE",
    });
    await expect(signPhotoUpload(null, input, adapter)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    for (let i = 0; i < 20; i++) await signPhotoUpload(actorOf(user), input, adapter);
    await expect(signPhotoUpload(actorOf(user), input, adapter)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("SigV4 presigning reproduces AWS's published example", () => {
    // "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)", GET example.
    const url = presignRequest({
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/test.txt",
      expiresInSeconds: 86_400,
      signedHeaders: {},
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
      },
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
        "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
        "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
        "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("the Supabase S3 adapter signs a 10-minute PUT bound to the content type, and inspects objects", async () => {
    const storage = supabaseS3Storage(
      {
        endpoint: "https://proj.storage.supabase.co/storage/v1/s3",
        region: "ap-south-1",
        accessKeyId: "key-id",
        secretAccessKey: "secret",
      },
      () => new Date("2026-10-25T10:00:00Z"),
    );
    const signed = await storage.signUpload({
      bucket: "dish-photos",
      key: "u1/abc.webp",
      contentType: "image/webp",
      expiresInSeconds: 600,
    });
    const url = new URL(signed.uploadUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://proj.storage.supabase.co/storage/v1/s3/dish-photos/u1/abc.webp",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "key-id/20261025/ap-south-1/s3/aws4_request",
    );
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.headers).toEqual({ "content-type": "image/webp" });
    expect(signed.expiresAt.toISOString()).toBe("2026-10-25T10:10:00.000Z");

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "content-length": "123456", "content-type": "image/webp" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    try {
      expect(await storage.inspect({ bucket: "dish-photos", key: "u1/abc.webp" })).toEqual({
        size: 123456,
        contentType: "image/webp",
      });
      expect(fetchMock.mock.calls[0][1]?.method).toBe("HEAD");
      expect(await storage.inspect({ bucket: "dish-photos", key: "u1/missing.webp" })).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("photos are scaled down to 1600 px on the longer side, never up", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1200, 4800)).toEqual({ width: 400, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
