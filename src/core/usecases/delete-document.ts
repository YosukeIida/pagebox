import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";

export async function deleteDocument(
  deps: { storage: StoragePort; repo: DocumentRepository },
  slug: string,
  groupId: string,
): Promise<boolean> {
  const meta = await deps.repo.findBySlug(slug);
  if (!meta) return false;
  if (meta.groupId !== groupId) return false;
  await deps.storage.delete(`${slug}.html`);
  await deps.repo.delete(slug);
  return true;
}
