import type { DocumentMeta, DocumentVersion } from "../core/document";

export interface DocumentRepository {
  // 新規ドキュメント作成。documents 行と v1 を一括で書く。
  save(doc: DocumentMeta, first: DocumentVersion): Promise<void>;
  // 版を追記し、documents 側の最新版スナップショット（title/size/latest_version/updated_at 等）を更新する。
  addVersion(version: DocumentVersion): Promise<void>;
  // 最新版のスナップショットを返す。
  findBySlug(slug: string): Promise<DocumentMeta | null>;
  findVersion(slug: string, version: number): Promise<DocumentVersion | null>;
  // version DESC（新しい順）。
  listVersions(slug: string): Promise<DocumentVersion[]>;
  // 同名 / 同 title の既存ドキュメントを探す（アップロード時の「更新か新規か」判定用）。
  findByNameOrTitle(groupId: string, originalName: string, title: string | null): Promise<DocumentMeta[]>;
  // updated_at DESC（更新の新しい順）。
  list(groupId: string): Promise<DocumentMeta[]>;
  // ドキュメントと全版のメタを削除する（blob の削除は usecase 側の責務）。
  delete(slug: string): Promise<void>;
}
