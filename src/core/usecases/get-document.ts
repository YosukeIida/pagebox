import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta } from "../document";

export async function getDocument(
  deps: { storage: StoragePort; repo: DocumentRepository },
  slug: string,
): Promise<{ meta: DocumentMeta; data: Uint8Array } | null> {
  const meta = await deps.repo.findBySlug(slug);
  if (!meta) return null;
  const data = await deps.storage.get(`${slug}.html`);
  if (!data) return null;
  return { meta, data };
}
