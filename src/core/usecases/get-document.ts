import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta, DocumentVersion } from "../document";

// version 未指定なら最新版を返す。blob は必ず version.storageKey から引く
// （v1 以前の既存オブジェクトは `${slug}.html` のままなので、キーを組み立ててはいけない）。
export async function getDocument(
  deps: { storage: StoragePort; repo: DocumentRepository },
  slug: string,
  version?: number,
): Promise<{ meta: DocumentMeta; version: DocumentVersion; data: Uint8Array } | null> {
  const meta = await deps.repo.findBySlug(slug);
  if (!meta) return null;

  const target = await deps.repo.findVersion(slug, version ?? meta.latestVersion);
  if (!target) return null;

  const data = await deps.storage.get(target.storageKey);
  if (!data) return null;

  return { meta, version: target, data };
}
