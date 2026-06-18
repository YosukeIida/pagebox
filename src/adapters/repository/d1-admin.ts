import type { D1Db } from "./d1";
import type { AdminRepository, AdminStats } from "../../ports/admin-repository";

export function createD1AdminRepository(db: D1Db): AdminRepository {
  return {
    async getStats(): Promise<AdminStats> {
      const [userRows, recentRows, totalsRow] = await db.batch([
        db.prepare(`
          SELECT u.email, u.created_at,
            COUNT(d.slug) AS doc_count,
            COALESCE(SUM(d.size), 0) AS total_size
          FROM users u
          LEFT JOIN documents d ON d.uploaded_by = u.id
          GROUP BY u.id
          ORDER BY doc_count DESC
        `),
        db.prepare(`
          SELECT d.slug, d.title, d.size, d.created_at, u.email AS uploaded_by
          FROM documents d
          JOIN users u ON u.id = d.uploaded_by
          ORDER BY d.created_at DESC
          LIMIT 20
        `),
        db.prepare(`
          SELECT COUNT(*) AS total_count, COALESCE(SUM(size), 0) AS total_size
          FROM documents
        `),
      ]);

      type UserRow = { email: string; created_at: number; doc_count: number; total_size: number };
      type DocRow = { slug: string; title: string; size: number; created_at: number; uploaded_by: string };
      type TotalsRow = { total_count: number; total_size: number };

      const users = (userRows as { results: UserRow[] }).results ?? [];
      const docs = (recentRows as { results: DocRow[] }).results ?? [];
      const totals = (totalsRow as { results: TotalsRow[] }).results?.[0] ?? { total_count: 0, total_size: 0 };

      return {
        userStats: users.map((r) => ({
          email: r.email,
          createdAt: new Date(r.created_at),
          docCount: r.doc_count,
          totalSize: r.total_size,
        })),
        recentDocs: docs.map((r) => ({
          slug: r.slug,
          title: r.title,
          uploadedBy: r.uploaded_by,
          createdAt: new Date(r.created_at),
          size: r.size,
        })),
        totalDocCount: totals.total_count,
        totalSize: totals.total_size,
      };
    },
  };
}
