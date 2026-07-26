import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta, DocumentVersion } from "../../core/document";

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
  description: string | null;
  original_name: string;
  size: number;
  content_type: string;
  created_at: number;
  group_id: string;
  uploaded_by: string;
  latest_version: number;
  updated_at: number | null;
};

type VersionRow = {
  slug: string;
  version: number;
  title: string;
  description: string | null;
  original_name: string;
  size: number;
  content_type: string;
  storage_key: string;
  created_at: number;
  created_by: string;
  source_version: number | null;
};

function rowToMeta(row: Row): DocumentMeta {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    originalName: row.original_name,
    size: row.size,
    contentType: row.content_type,
    createdAt: new Date(row.created_at),
    groupId: row.group_id,
    uploadedBy: row.uploaded_by,
    latestVersion: row.latest_version,
    updatedAt: new Date(row.updated_at ?? row.created_at),
  };
}

function rowToVersion(row: VersionRow): DocumentVersion {
  return {
    slug: row.slug,
    version: row.version,
    title: row.title,
    description: row.description ?? null,
    originalName: row.original_name,
    size: row.size,
    contentType: row.content_type,
    storageKey: row.storage_key,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by,
    sourceVersion: row.source_version ?? null,
  };
}

const INSERT_VERSION = `INSERT INTO document_versions
   (slug, version, title, description, original_name, size, content_type, storage_key, created_at, created_by, source_version)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function versionBindings(v: DocumentVersion): unknown[] {
  return [v.slug, v.version, v.title, v.description, v.originalName, v.size, v.contentType,
          v.storageKey, v.createdAt.getTime(), v.createdBy, v.sourceVersion];
}

export function createD1Repository(db: D1Db): DocumentRepository {
  return {
    async save(doc: DocumentMeta, first: DocumentVersion): Promise<void> {
      await db.batch([
        db
          .prepare(
            `INSERT INTO documents
               (slug, title, description, original_name, size, content_type, created_at, group_id, uploaded_by, latest_version, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(doc.slug, doc.title, doc.description, doc.originalName, doc.size, doc.contentType,
                doc.createdAt.getTime(), doc.groupId, doc.uploadedBy, doc.latestVersion, doc.updatedAt.getTime()),
        db.prepare(INSERT_VERSION).bind(...versionBindings(first)),
      ]);
    },

    async addVersion(version: DocumentVersion): Promise<void> {
      await db.batch([
        db.prepare(INSERT_VERSION).bind(...versionBindings(version)),
        db
          .prepare(
            `UPDATE documents
                SET title = ?, description = ?, original_name = ?, size = ?, content_type = ?,
                    latest_version = ?, updated_at = ?
              WHERE slug = ?`,
          )
          .bind(version.title, version.description, version.originalName, version.size, version.contentType,
                version.version, version.createdAt.getTime(), version.slug),
      ]);
    },

    async findBySlug(slug: string): Promise<DocumentMeta | null> {
      const row = await db.prepare(`SELECT * FROM documents WHERE slug = ?`).bind(slug).first<Row>();
      return row ? rowToMeta(row) : null;
    },

    async findVersion(slug: string, version: number): Promise<DocumentVersion | null> {
      const row = await db
        .prepare(`SELECT * FROM document_versions WHERE slug = ? AND version = ?`)
        .bind(slug, version)
        .first<VersionRow>();
      return row ? rowToVersion(row) : null;
    },

    async listVersions(slug: string): Promise<DocumentVersion[]> {
      const { results } = await db
        .prepare(`SELECT * FROM document_versions WHERE slug = ? ORDER BY version DESC`)
        .bind(slug)
        .all<VersionRow>();
      return results.map(rowToVersion);
    },

    async findByNameOrTitle(groupId: string, originalName: string, title: string | null): Promise<DocumentMeta[]> {
      const clause = title === null ? `original_name = ?` : `(original_name = ? OR title = ?)`;
      const params = title === null ? [groupId, originalName] : [groupId, originalName, title];
      const { results } = await db
        .prepare(`SELECT * FROM documents WHERE group_id = ? AND ${clause} ORDER BY updated_at DESC LIMIT 5`)
        .bind(...params)
        .all<Row>();
      return results.map(rowToMeta);
    },

    async list(groupId: string): Promise<DocumentMeta[]> {
      const { results } = await db
        .prepare(`SELECT * FROM documents WHERE group_id = ? ORDER BY updated_at DESC`)
        .bind(groupId)
        .all<Row>();
      return results.map(rowToMeta);
    },

    async delete(slug: string): Promise<void> {
      await db.batch([
        db.prepare(`DELETE FROM document_versions WHERE slug = ?`).bind(slug),
        db.prepare(`DELETE FROM documents WHERE slug = ?`).bind(slug),
      ]);
    },
  };
}
