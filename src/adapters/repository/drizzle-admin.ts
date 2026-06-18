import { eq, desc, count, sum, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { users, documents } from "../../db/schema";
import type { AdminRepository, AdminStats } from "../../ports/admin-repository";

export function createDrizzleAdminRepository(db: DB): AdminRepository {
  return {
    async getStats(): Promise<AdminStats> {
      const userStats = await db
        .select({
          email: users.email,
          createdAt: users.createdAt,
          docCount: sql<number>`COUNT(${documents.slug})`.as("doc_count"),
          totalSize: sql<number>`COALESCE(SUM(${documents.size}), 0)`.as("total_size"),
        })
        .from(users)
        .leftJoin(documents, eq(documents.uploadedBy, users.id))
        .groupBy(users.id)
        .orderBy(desc(sql`doc_count`))
        .all();

      const recentDocs = await db
        .select({
          slug: documents.slug,
          title: documents.title,
          size: documents.size,
          createdAt: documents.createdAt,
          uploadedBy: users.email,
        })
        .from(documents)
        .innerJoin(users, eq(users.id, documents.uploadedBy))
        .orderBy(desc(documents.createdAt))
        .limit(20)
        .all();

      const [totals] = await db
        .select({
          totalDocCount: count(documents.slug),
          totalSize: sql<number>`COALESCE(SUM(${documents.size}), 0)`,
        })
        .from(documents)
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
        })),
        totalDocCount: totals?.totalDocCount ?? 0,
        totalSize: Number(totals?.totalSize ?? 0),
      };
    },
  };
}
