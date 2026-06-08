import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta } from "../../core/document";

interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface D1Db {
  prepare(query: string): D1Stmt;
  batch(statements: ReturnType<D1Db["prepare"]>[]): Promise<unknown[]>;
}

type Row = {
  slug: string;
  title: string;
  original_name: string;
  size: number;
  content_type: string;
  created_at: number;
  group_id: string;
  uploaded_by: string;
};

function rowToMeta(row: Row): DocumentMeta {
  return {
    slug: row.slug,
    title: row.title,
    originalName: row.original_name,
    size: row.size,
    contentType: row.content_type,
    createdAt: new Date(row.created_at),
    groupId: row.group_id,
    uploadedBy: row.uploaded_by,
  };
}

export function createD1Repository(db: D1Db): DocumentRepository {
  return {
    async save(doc: DocumentMeta): Promise<void> {
      await db
        .prepare(
          `INSERT INTO documents (slug, title, original_name, size, content_type, created_at, group_id, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(doc.slug, doc.title, doc.originalName, doc.size, doc.contentType,
              doc.createdAt.getTime(), doc.groupId, doc.uploadedBy)
        .run();
    },

    async findBySlug(slug: string): Promise<DocumentMeta | null> {
      const row = await db.prepare(`SELECT * FROM documents WHERE slug = ?`).bind(slug).first<Row>();
      return row ? rowToMeta(row) : null;
    },

    async list(groupId: string): Promise<DocumentMeta[]> {
      const { results } = await db
        .prepare(`SELECT * FROM documents WHERE group_id = ? ORDER BY created_at DESC`)
        .bind(groupId)
        .all<Row>();
      return results.map(rowToMeta);
    },

    async delete(slug: string): Promise<void> {
      await db.prepare(`DELETE FROM documents WHERE slug = ?`).bind(slug).run();
    },
  };
}
