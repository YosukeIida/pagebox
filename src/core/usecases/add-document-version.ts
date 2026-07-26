import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentVersion } from "../document";
import { isHtmlUpload, deriveTitle, extractDescription, versionStorageKey, MAX_UPLOAD_BYTES } from "../document";
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

// 既存ドキュメントに新しい版を追記する。append-only なので過去の版は変更しない。
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

  const doc = await deps.repo.findBySlug(input.slug);
  if (!doc) throw new NotFoundError("ドキュメントが見つかりません");
  if (doc.groupId !== input.groupId) throw new NotFoundError("ドキュメントが見つかりません");

  const html = new TextDecoder().decode(input.bytes);
  const title = deriveTitle(html, input.fileName);
  const description = extractDescription(html);

  const next = doc.latestVersion + 1;
  const key = versionStorageKey(input.slug, next);
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
  await deps.repo.addVersion(version);
  return version;
}
