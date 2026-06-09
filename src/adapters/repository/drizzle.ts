import { eq, desc } from "drizzle-orm";
import type { DB } from "../../db/client";
import { documents } from "../../db/schema";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta } from "../../core/document";

type Row = typeof documents.$inferSelect;

function rowToMeta(row: Row): DocumentMeta {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    originalName: row.originalName,
    size: row.size,
    contentType: row.contentType,
    createdAt: row.createdAt,
    groupId: row.groupId,
    uploadedBy: row.uploadedBy,
  };
}

export function createDrizzleRepository(db: DB): DocumentRepository {
  return {
    async save(doc: DocumentMeta): Promise<void> {
      await db.insert(documents).values({
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        originalName: doc.originalName,
        size: doc.size,
        contentType: doc.contentType,
        createdAt: doc.createdAt,
        groupId: doc.groupId,
        uploadedBy: doc.uploadedBy,
      });
    },

    async findBySlug(slug: string): Promise<DocumentMeta | null> {
      const row = await db.select().from(documents).where(eq(documents.slug, slug)).get();
      return row ? rowToMeta(row) : null;
    },

    async list(groupId: string): Promise<DocumentMeta[]> {
      const rows = await db
        .select()
        .from(documents)
        .where(eq(documents.groupId, groupId))
        .orderBy(desc(documents.createdAt))
        .all();
      return rows.map(rowToMeta);
    },

    async delete(slug: string): Promise<void> {
      await db.delete(documents).where(eq(documents.slug, slug));
    },
  };
}
