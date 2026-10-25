// AWS Signature Version 4 query-string presigning for S3-compatible storage (Supabase's S3
// protocol). Follows "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)";
// the unit test checks it against AWS's published example. No SDK: about 60 lines of HMAC.
import { createHash, createHmac } from "node:crypto";

const sha256Hex = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data, "utf8").digest();

/** RFC 3986 encoding as SigV4 wants it: everything but A-Z a-z 0-9 - _ . ~ ; '/' kept in paths. */
function encode(value: string, keepSlash: boolean): string {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => {
      const c = String.fromCharCode(byte);
      if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === "/")) return c;
      return `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
}

const amzDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export type PresignRequest = {
  method: "GET" | "PUT" | "HEAD";
  /** The object URL without a query string. */
  url: string;
  expiresInSeconds: number;
  /** Extra headers the client must send exactly (lowercase names); `host` is always signed. */
  signedHeaders: Record<string, string>;
  credentials: { accessKeyId: string; secretAccessKey: string; region: string };
  now: Date;
};

/** A SigV4 presigned URL (query authentication, unsigned payload) for one S3 request. */
export function presignRequest(input: PresignRequest): string {
  const url = new URL(input.url);
  const canonicalUri = encode(decodeURIComponent(url.pathname), true);
  const date = amzDate(input.now);
  const day = date.slice(0, 8);
  const scope = `${day}/${input.credentials.region}/s3/aws4_request`;

  const headers: Record<string, string> = { ...input.signedHeaders, host: url.host };
  const names = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const signedHeaderList = names.join(";");
  const canonicalHeaders = names.map((h) => `${h}:${headers[h].trim()}\n`).join("");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": date,
    "X-Amz-Expires": String(input.expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaderList,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encode(k, false)}=${encode(query[k], false)}`)
    .join("&");

  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(
    hmac(
      hmac(hmac(`AWS4${input.credentials.secretAccessKey}`, day), input.credentials.region),
      "s3",
    ),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return `${url.protocol}//${url.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Path-style S3 object URL under the endpoint: <endpoint>/<bucket>/<key>. */
export function presignS3(
  input: Omit<PresignRequest, "url"> & { endpoint: string; bucket: string; key: string },
): string {
  const { endpoint, bucket, key, ...rest } = input;
  return presignRequest({ ...rest, url: `${endpoint.replace(/\/+$/, "")}/${bucket}/${key}` });
}
