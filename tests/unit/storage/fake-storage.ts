import type { StorageAdapter, StoredObject } from "@/server/storage";

/** Records signing requests and serves `objects` (key → size and type) instead of a storage service. */
export function fakeStorage(objects: Record<string, StoredObject> = {}) {
  const calls: Parameters<StorageAdapter["signUpload"]>[0][] = [];
  const adapter: StorageAdapter = {
    name: "fake",
    async signUpload(input) {
      calls.push(input);
      return {
        uploadUrl: `https://storage.test/upload/${input.bucket}/${input.key}?token=t`,
        headers: { "content-type": input.contentType },
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      };
    },
    async inspect({ key }) {
      return objects[key] ?? null;
    },
  };
  return { adapter, calls, objects };
}
