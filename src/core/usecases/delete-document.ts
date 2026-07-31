import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentVersion } from "../document";

// ドキュメントを全版まとめて削除する。削除した版を返すので、
// 呼び出し側は OGP 画像キャッシュ（版ごとにキーが分かれている）の掃除に使える。
//
// 順序が重要: **先に DB を消してから blob を消す。**
// 逆順（blob → DB）だと、途中で blob 削除が失敗したときに
// 「DB には残っているのに配信は 404」という壊れたドキュメントができる。
// DB を先に消せば、失敗して残るのは参照されない blob だけなので実害がない。
export async function deleteDocument(
  deps: { storage: StoragePort; repo: DocumentRepository },
  slug: string,
  groupId: string,
): Promise<DocumentVersion[] | null> {
  const meta = await deps.repo.findBySlug(slug);
  if (!meta) return null;
  if (meta.groupId !== groupId) return null;

  const versions = await deps.repo.listVersions(slug);
  await deps.repo.delete(slug);

  // ここから先の失敗は孤児 blob が残るだけなので、1つ失敗しても残りの掃除を続ける
  for (const v of versions) {
    await deps.storage.delete(v.storageKey).catch(() => { /* 孤児は残るが実害なし */ });
  }
  return versions;
}
