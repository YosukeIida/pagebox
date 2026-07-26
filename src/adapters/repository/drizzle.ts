import { and, eq, or, desc } from "drizzle-orm";
import type { DB } from "../../db/client";
import { documents, documentVersions } from "../../db/schema";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta, DocumentVersion } from "../../core/document";

type Row = typeof documents.$inferSelect;
type VersionRow = typeof documentVersions.$inferSelect;

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
    latestVersion: row.latestVersion,
    updatedAt: row.updatedAt ?? row.createdAt,
  };
}

function rowToVersion(row: VersionRow): DocumentVersion {
  return {
    slug: row.slug,
    version: row.version,
    title: row.title,
    description: row.description ?? null,
    originalName: row.originalName,
    size: row.size,
    contentType: row.contentType,
    storageKey: row.storageKey,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    sourceVersion: row.sourceVersion ?? null,
  };
}

function versionValues(v: DocumentVersion): typeof documentVersions.$inferInsert {
  return {
    slug: v.slug,
    version: v.version,
    title: v.title,
    description: v.description,
    originalName: v.originalName,
    size: v.size,
    contentType: v.contentType,
    storageKey: v.storageKey,
    createdAt: v.createdAt,
    createdBy: v.createdBy,
    sourceVersion: v.sourceVersion,
  };
}

export function createDrizzleRepository(db: DB): DocumentRepository {
  return {
    async save(doc: DocumentMeta, first: DocumentVersion): Promise<void> {
      // bun-sqlite の transaction コールバックは同期のため .run() を使う
      db.transaction((tx) => {
        tx.insert(documents).values({
          slug: doc.slug,
          title: doc.title,
          description: doc.description,
          originalName: doc.originalName,
          size: doc.size,
          contentType: doc.contentType,
          createdAt: doc.createdAt,
          groupId: doc.groupId,
          uploadedBy: doc.uploadedBy,
          latestVersion: doc.latestVersion,
          updatedAt: doc.updatedAt,
        }).run();
        tx.insert(documentVersions).values(versionValues(first)).run();
      });
    },

    async addVersion(version: DocumentVersion): Promise<void> {
      db.transaction((tx) => {
        tx.insert(documentVersions).values(versionValues(version)).run();
        tx.update(documents)
          .set({
            title: version.title,
            description: version.description,
            originalName: version.originalName,
            size: version.size,
            contentType: version.contentType,
            latestVersion: version.version,
            updatedAt: version.createdAt,
          })
          .where(eq(documents.slug, version.slug))
          .run();
      });
    },

    async findBySlug(slug: string): Promise<DocumentMeta | null> {
      const row = await db.select().from(documents).where(eq(documents.slug, slug)).get();
      return row ? rowToMeta(row) : null;
    },

    async findVersion(slug: string, version: number): Promise<DocumentVersion | null> {
      const row = await db
        .select()
        .from(documentVersions)
        .where(and(eq(documentVersions.slug, slug), eq(documentVersions.version, version)))
        .get();
      return row ? rowToVersion(row) : null;
    },

    async listVersions(slug: string): Promise<DocumentVersion[]> {
      const rows = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.slug, slug))
        .orderBy(desc(documentVersions.version))
        .all();
      return rows.map(rowToVersion);
    },

    async findByNameOrTitle(groupId: string, originalName: string, title: string | null): Promise<DocumentMeta[]> {
      const nameMatch = eq(documents.originalName, originalName);
      const rows = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.groupId, groupId),
            title === null ? nameMatch : or(nameMatch, eq(documents.title, title)),
          ),
        )
        .orderBy(desc(documents.updatedAt))
        .limit(5)
        .all();
      return rows.map(rowToMeta);
    },

    async list(groupId: string): Promise<DocumentMeta[]> {
      const rows = await db
        .select()
        .from(documents)
        .where(eq(documents.groupId, groupId))
        .orderBy(desc(documents.updatedAt))
        .all();
      return rows.map(rowToMeta);
    },

    async delete(slug: string): Promise<void> {
      db.transaction((tx) => {
        tx.delete(documentVersions).where(eq(documentVersions.slug, slug)).run();
        tx.delete(documents).where(eq(documents.slug, slug)).run();
      });
    },
  };
}
