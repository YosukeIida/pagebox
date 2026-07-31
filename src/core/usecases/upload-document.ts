import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta, DocumentVersion } from "../document";
import { isHtmlUpload, deriveTitle, extractDescription, versionStorageKey, MAX_UPLOAD_BYTES } from "../document";
import { generateSlug, nanoid } from "../ids";
import { ValidationError } from "../errors";

export interface UploadInput {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  groupId: string;
  uploadedBy: string;
}

export interface UploadDeps {
  storage: StoragePort;
  repo: DocumentRepository;
}

export async function uploadDocument(deps: UploadDeps, input: UploadInput): Promise<DocumentMeta> {
  if (!isHtmlUpload(input.fileName, input.contentType)) {
    throw new ValidationError("HTML ファイルのみ対応しています");
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError("ファイルサイズが上限（10MB）を超えています");
  }

  const html = new TextDecoder().decode(input.bytes);
  const title = deriveTitle(html, input.fileName);
  const description = extractDescription(html);

  let slug = "";
  for (let i = 0; i < 5; i++) {
    const candidate = generateSlug();
    if ((await deps.repo.findBySlug(candidate)) === null) {
      slug = candidate;
      break;
    }
  }
  if (!slug) throw new Error("slug の採番に失敗しました");

  const key = versionStorageKey(slug, 1, nanoid(8));
  await deps.storage.put(key, input.bytes, { contentType: "text/html" });

  const now = new Date();
  const meta: DocumentMeta = {
    slug,
    title,
    description,
    originalName: input.fileName,
    size: input.bytes.byteLength,
    contentType: "text/html",
    createdAt: now,
    groupId: input.groupId,
    uploadedBy: input.uploadedBy,
    latestVersion: 1,
    updatedAt: now,
  };
  const first: DocumentVersion = {
    slug,
    version: 1,
    title,
    description,
    originalName: input.fileName,
    size: input.bytes.byteLength,
    contentType: "text/html",
    storageKey: key,
    createdAt: now,
    createdBy: input.uploadedBy,
    sourceVersion: null,
  };
  try {
    await deps.repo.save(meta, first);
  } catch (e) {
    // add-document-version と同じ理由で、blob を消す前にコミット済みかを確認する。
    // キーは書き込みごとに一意なので、v1 の storageKey が自分のものなら自分の書き込み。
    const landed = await deps.repo.findVersion(slug, 1);
    if (landed?.storageKey === key) return meta;
    // 参照されない blob を残さない
    await deps.storage.delete(key).catch(() => { /* 掃除の失敗で本来のエラーを隠さない */ });
    throw e;
  }
  return meta;
}
