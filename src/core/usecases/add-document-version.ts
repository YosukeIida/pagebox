import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentVersion } from "../document";
import { isHtmlUpload, deriveTitle, extractDescription, versionStorageKey, MAX_UPLOAD_BYTES } from "../document";
import { nanoid } from "../ids";
import { NotFoundError, ValidationError } from "../errors";

export interface AddVersionInput {
  slug: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  // 呼び出し元のグループ。ドキュメントの groupId と一致しなければ拒否する。
  groupId: string;
  createdBy: string;
  // 「この版に戻す」で複製した元の版番号。通常のアップロードでは null。
  sourceVersion?: number | null;
}

export interface AddVersionDeps {
  storage: StoragePort;
  repo: DocumentRepository;
}

// 同じ slug への同時追加で版番号が取られたときの再採番回数。
// 数回で収まらないのは異常な負荷なので、無限に粘らず失敗させる。
const MAX_VERSION_ATTEMPTS = 5;

// 既存ドキュメントに新しい版を追記する。append-only なので過去の版は変更しない。
//
// 同時更新の扱い:
//   版番号は「最新版 + 1」を読んで決めるため、同時実行では同じ番号を狙うことがある。
//   PK (slug, version) が勝者を1人に決めるので、敗者は
//     1. 自分が書いた blob を消して（孤児を残さない）
//     2. その版番号が実際に埋まったことを確認し
//     3. 次の番号で再試行する
//   という手順を踏む。blob キーは書き込みごとに一意なので、
//   「DB は勝者のメタデータ・blob は敗者の中身」という食い違いは起きない。
export async function addDocumentVersion(
  deps: AddVersionDeps,
  input: AddVersionInput,
): Promise<DocumentVersion> {
  if (!isHtmlUpload(input.fileName, input.contentType)) {
    throw new ValidationError("HTML ファイルのみ対応しています");
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError("ファイルサイズが上限（10MB）を超えています");
  }

  const html = new TextDecoder().decode(input.bytes);
  const title = deriveTitle(html, input.fileName);
  const description = extractDescription(html);

  for (let attempt = 0; attempt < MAX_VERSION_ATTEMPTS; attempt++) {
    // 再試行ごとに読み直す（他のリクエストが版を進めている可能性があるため）
    const doc = await deps.repo.findBySlug(input.slug);
    if (!doc) throw new NotFoundError("ドキュメントが見つかりません");
    // 他グループのドキュメントは存在を伏せる。blob を書く前に弾く。
    if (doc.groupId !== input.groupId) throw new NotFoundError("ドキュメントが見つかりません");

    const next = doc.latestVersion + 1;
    const key = versionStorageKey(input.slug, next, nanoid(8));
    await deps.storage.put(key, input.bytes, { contentType: "text/html" });

    const version: DocumentVersion = {
      slug: input.slug,
      version: next,
      title,
      description,
      originalName: input.fileName,
      size: input.bytes.byteLength,
      contentType: "text/html",
      storageKey: key,
      createdAt: new Date(),
      createdBy: input.createdBy,
      sourceVersion: input.sourceVersion ?? null,
    };

    try {
      await deps.repo.addVersion(version);
      return version;
    } catch (e) {
      // **blob を消す前に「自分の書き込みがコミットされたか」を確認する。**
      // DB がコミットしたのにレスポンスだけ失われた場合、先に blob を消すと
      // DB から参照されている blob を削除してその版が恒久的に 404 になる。
      // キーは書き込みごとに一意なので、storageKey が自分のものなら自分の書き込み。
      const landed = await deps.repo.findVersion(input.slug, next);
      if (landed?.storageKey === key) return landed;

      // 自分の書き込みは残っていないので blob を片付ける（孤児を防ぐ）
      await deps.storage.delete(key).catch(() => { /* 掃除の失敗で本来のエラーを隠さない */ });

      // 版番号が埋まっていなければ採番の競合ではない別の障害なので、そのまま投げる
      if (!landed) throw e;
      // 他のリクエストがこの版を取った → 次の番号で再試行
    }
  }

  throw new Error("バージョンの採番に失敗しました（同時更新が続いています）");
}
