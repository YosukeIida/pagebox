import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import type { StoragePort } from "../../ports/storage";

export function createFsStorage(baseDir: string): StoragePort {
  mkdirSync(baseDir, { recursive: true });

  return {
    async put(key: string, data: Uint8Array): Promise<void> {
      if (key.includes("/")) throw new Error("key にパス区切りを含めることはできません");
      await Bun.write(join(baseDir, key), data);
    },

    async get(key: string): Promise<Uint8Array | null> {
      if (key.includes("/")) return null;
      const f = Bun.file(join(baseDir, key));
      if (!(await f.exists())) return null;
      return new Uint8Array(await f.arrayBuffer());
    },

    async delete(key: string): Promise<void> {
      if (key.includes("/")) return;
      await unlink(join(baseDir, key)).catch(() => {});
    },
  };
}
