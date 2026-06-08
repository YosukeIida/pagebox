import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta } from "../document";

export async function listDocuments(
  deps: { repo: DocumentRepository },
  groupId: string,
): Promise<DocumentMeta[]> {
  return deps.repo.list(groupId);
}
