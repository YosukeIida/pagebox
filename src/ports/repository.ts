import type { DocumentMeta } from "../core/document";

export interface DocumentRepository {
  save(doc: DocumentMeta): Promise<void>;
  findBySlug(slug: string): Promise<DocumentMeta | null>;
  list(groupId: string): Promise<DocumentMeta[]>;
  delete(slug: string): Promise<void>;
}
