import type { StoragePort } from "../../ports/storage";

// Minimal subset of R2Bucket interface (avoids @cloudflare/workers-types conflict with @types/bun)
interface R2Object {
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface R2Bkt {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}

export function createR2Storage(bucket: R2Bkt): StoragePort {
  return {
    async put(key: string, data: Uint8Array, meta?: { contentType?: string }): Promise<void> {
      await bucket.put(
        key,
        data,
        meta?.contentType ? { httpMetadata: { contentType: meta.contentType } } : undefined,
      );
    },

    async get(key: string): Promise<Uint8Array | null> {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return new Uint8Array(await obj.arrayBuffer());
    },

    async delete(key: string): Promise<void> {
      await bucket.delete(key);
    },
  };
}
