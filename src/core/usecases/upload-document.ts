import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta } from "../document";
import { isHtmlUpload, deriveTitle, MAX_UPLOAD_BYTES } from "../document";
import { generateSlug } from "../ids";
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

  let slug = "";
  for (let i = 0; i < 5; i++) {
    const candidate = generateSlug();
    if ((await deps.repo.findBySlug(candidate)) === null) {
      slug = candidate;
      break;
    }
  }
  if (!slug) throw new Error("slug の採番に失敗しました");

  const key = `${slug}.html`;
  await deps.storage.put(key, input.bytes, { contentType: "text/html" });

  const meta: DocumentMeta = {
    slug,
    title,
    originalName: input.fileName,
    size: input.bytes.byteLength,
    contentType: "text/html",
    createdAt: new Date(),
    groupId: input.groupId,
    uploadedBy: input.uploadedBy,
  };
  await deps.repo.save(meta);
  return meta;
}
