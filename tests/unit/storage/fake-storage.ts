import type { StorageAdapter, StoredObject } from "@/server/storage";

/**
 * Records signing requests and serves `objects` (key → size and type, and `data` for downloads)
 * instead of a storage service; `removed` lists the keys deleted.
 */
export function fakeStorage(objects: Record<string, StoredObject & { data?: Uint8Array }> = {}) {
  const calls: Parameters<StorageAdapter["signUpload"]>[0][] = [];
  const removed: string[] = [];
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
    async remove({ key }) {
      removed.push(key);
      delete objects[key];
    },
    async download({ key }) {
      const object = objects[key];
      if (!object) return null;
      return { data: object.data ?? new Uint8Array(object.size), contentType: object.contentType };
    },
    async signDownload({ bucket, key, expiresInSeconds }) {
      return `https://storage.test/view/${bucket}/${key}?expires=${expiresInSeconds}`;
    },
  };
  return { adapter, calls, objects, removed };
}
