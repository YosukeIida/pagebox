import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentVersion } from "../document";
import { NotFoundError } from "../errors";
import { addDocumentVersion } from "./add-document-version";

export interface RollbackInput {
  slug: string;
  // 戻したい版番号
  version: number;
  groupId: string;
  createdBy: string;
}

// 「この版に戻す」。append-only を保つため、指定した版の中身を複製して新しい最新版として公開する。
// 過去の版は消えないので、戻した操作自体も履歴に残る。
export async function rollbackDocumentVersion(
  deps: { storage: StoragePort; repo: DocumentRepository },
  input: RollbackInput,
): Promise<DocumentVersion> {
  const target = await deps.repo.findVersion(input.slug, input.version);
  if (!target) throw new NotFoundError("バージョンが見つかりません");

  const bytes = await deps.storage.get(target.storageKey);
  if (!bytes) throw new NotFoundError("バージョンの実体が見つかりません");

  return addDocumentVersion(deps, {
    slug: input.slug,
    fileName: target.originalName,
    contentType: target.contentType,
    bytes,
    groupId: input.groupId,
    createdBy: input.createdBy,
    sourceVersion: target.version,
  });
}
