import { eq, desc, count, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { users, documents, documentVersions } from "../../db/schema";
import type { AdminRepository, AdminStats } from "../../ports/admin-repository";

// サイズ系の集計は document_versions を基準にする（d1-admin.ts と同じ方針）。
export function createDrizzleAdminRepository(db: DB): AdminRepository {
  return {
    async getStats(): Promise<AdminStats> {
      const userStats = await db
        .select({
          email: users.email,
          createdAt: users.createdAt,
          docCount: sql<number>`(SELECT COUNT(*) FROM ${documents} d WHERE d.uploaded_by = ${users.id})`.as("doc_count"),
          totalSize: sql<number>`(SELECT COALESCE(SUM(v.size), 0) FROM ${documentVersions} v WHERE v.created_by = ${users.id})`.as("total_size"),
        })
        .from(users)
        .orderBy(desc(sql`doc_count`))
        .all();

      const recentDocs = await db
        .select({
          slug: documents.slug,
          title: documents.title,
          size: documents.size,
          createdAt: documents.createdAt,
          latestVersion: documents.latestVersion,
          uploadedBy: users.email,
        })
        .from(documents)
        .innerJoin(users, eq(users.id, documents.uploadedBy))
        .orderBy(desc(documents.createdAt))
        .limit(20)
        .all();

      const [docTotals] = await db.select({ count: count() }).from(documents).all();
      const [versionTotals] = await db
        .select({
          count: count(),
          size: sql<number>`COALESCE(SUM(${documentVersions.size}), 0)`,
        })
        .from(documentVersions)
        .all();

      return {
        userStats: userStats.map((r) => ({
          email: r.email,
          createdAt: r.createdAt,
          docCount: Number(r.docCount),
          totalSize: Number(r.totalSize),
        })),
        recentDocs: recentDocs.map((r) => ({
          slug: r.slug,
          title: r.title,
          uploadedBy: r.uploadedBy,
          createdAt: r.createdAt,
          size: r.size,
          latestVersion: r.latestVersion,
        })),
        totalDocCount: Number(docTotals?.count ?? 0),
        totalVersionCount: Number(versionTotals?.count ?? 0),
        totalSize: Number(versionTotals?.size ?? 0),
      };
    },
  };
}
