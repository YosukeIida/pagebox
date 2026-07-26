import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentVersion } from "../document";

// ドキュメントを全版まとめて削除する。削除した版を返すので、
// 呼び出し側は OGP 画像キャッシュ（版ごとにキーが分かれている）の掃除に使える。
export async function deleteDocument(
  deps: { storage: StoragePort; repo: DocumentRepository },
  slug: string,
  groupId: string,
): Promise<DocumentVersion[] | null> {
  const meta = await deps.repo.findBySlug(slug);
  if (!meta) return null;
  if (meta.groupId !== groupId) return null;

  const versions = await deps.repo.listVersions(slug);
  for (const v of versions) {
    await deps.storage.delete(v.storageKey);
  }
  await deps.repo.delete(slug);
  return versions;
}
