// Photo storage behind one small interface (docs/06 POST /api/v1/uploads/sign). Supabase Storage is
// reached through its S3 protocol, because only an S3 presigned URL can expire after 10 minutes:
// Supabase's own signed upload URLs are fixed at 2 hours on hosted projects. Without the four S3
// variables uploads are off and the rate flow hides the photo step. Tests pass their own adapter.
import { env } from "@/env";
import { presignS3 } from "./sigv4";

export type SignedUpload = {
  /** PUT the file here with exactly these headers; it can create one object, once. */
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: Date;
};

export type StoredObject = { size: number; contentType: string };

export interface StorageAdapter {
  readonly name: string;
  signUpload(input: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<SignedUpload>;
  /** Size and type of a stored object, or null when it does not exist. */
  inspect(input: { bucket: string; key: string }): Promise<StoredObject | null>;
}

export type S3Config = {
  /** e.g. https://<project-ref>.storage.supabase.co/storage/v1/s3 */
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Supabase Storage through its S3 protocol, with SigV4 presigned URLs (server only). */
export function supabaseS3Storage(
  config: S3Config,
  now: () => Date = () => new Date(),
): StorageAdapter {
  const credentials = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
  };
  return {
    name: "supabase-s3",
    async signUpload({ bucket, key, contentType, expiresInSeconds }) {
      const at = now();
      const uploadUrl = presignS3({
        method: "PUT",
        endpoint: config.endpoint,
        bucket,
        key,
        expiresInSeconds,
        // Signing the content type binds it: a PUT with any other type is refused.
        signedHeaders: { "content-type": contentType },
        credentials,
        now: at,
      });
      return {
        uploadUrl,
        headers: { "content-type": contentType },
        expiresAt: new Date(at.getTime() + expiresInSeconds * 1000),
      };
    },
    async inspect({ bucket, key }) {
      const url = presignS3({
        method: "HEAD",
        endpoint: config.endpoint,
        bucket,
        key,
        expiresInSeconds: 60,
        signedHeaders: {},
        credentials,
        now: now(),
      });
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Storage answered ${res.status}`);
      return {
        size: Number(res.headers.get("content-length") ?? "0"),
        contentType: res.headers.get("content-type") ?? "",
      };
    },
  };
}

function s3Config(): S3Config | null {
  const {
    SUPABASE_S3_ENDPOINT,
    SUPABASE_S3_REGION,
    SUPABASE_S3_ACCESS_KEY_ID,
    SUPABASE_S3_SECRET_ACCESS_KEY,
  } = env;
  if (
    !SUPABASE_S3_ENDPOINT ||
    !SUPABASE_S3_REGION ||
    !SUPABASE_S3_ACCESS_KEY_ID ||
    !SUPABASE_S3_SECRET_ACCESS_KEY
  ) {
    return null;
  }
  return {
    endpoint: SUPABASE_S3_ENDPOINT,
    region: SUPABASE_S3_REGION,
    accessKeyId: SUPABASE_S3_ACCESS_KEY_ID,
    secretAccessKey: SUPABASE_S3_SECRET_ACCESS_KEY,
  };
}

/** The configured storage, or null when photo uploads are not set up. */
export function getStorage(): StorageAdapter | null {
  const config = s3Config();
  return config ? supabaseS3Storage(config) : null;
}

export function photoUploadsEnabled(): boolean {
  return s3Config() !== null;
}
