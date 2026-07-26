import type { D1Db } from "./d1";
import type { AdminRepository, AdminStats } from "../../ports/admin-repository";

// サイズ系の集計は document_versions を基準にする。
// バージョンは無制限に保持するため、documents（最新版のスナップショット）だけを足すと
// 実際の R2 使用量から乖離する。
export function createD1AdminRepository(db: D1Db): AdminRepository {
  return {
    async getStats(): Promise<AdminStats> {
      const [userRows, recentRows, totalsRow] = await db.batch([
        db.prepare(`
          SELECT u.email, u.created_at,
            (SELECT COUNT(*) FROM documents d WHERE d.uploaded_by = u.id) AS doc_count,
            (SELECT COALESCE(SUM(v.size), 0) FROM document_versions v WHERE v.created_by = u.id) AS total_size
          FROM users u
          ORDER BY doc_count DESC
        `),
        db.prepare(`
          SELECT d.slug, d.title, d.size, d.created_at, d.latest_version, u.email AS uploaded_by
          FROM documents d
          JOIN users u ON u.id = d.uploaded_by
          ORDER BY d.created_at DESC
          LIMIT 20
        `),
        db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM documents) AS total_count,
            (SELECT COUNT(*) FROM document_versions) AS total_version_count,
            (SELECT COALESCE(SUM(size), 0) FROM document_versions) AS total_size
        `),
      ]);

      type UserRow = { email: string; created_at: number; doc_count: number; total_size: number };
      type DocRow = {
        slug: string; title: string; size: number; created_at: number;
        latest_version: number; uploaded_by: string;
      };
      type TotalsRow = { total_count: number; total_version_count: number; total_size: number };

      const users = (userRows as { results: UserRow[] }).results ?? [];
      const docs = (recentRows as { results: DocRow[] }).results ?? [];
      const totals = (totalsRow as { results: TotalsRow[] }).results?.[0]
        ?? { total_count: 0, total_version_count: 0, total_size: 0 };

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
          latestVersion: r.latest_version,
        })),
        totalDocCount: totals.total_count,
        totalVersionCount: totals.total_version_count,
        totalSize: totals.total_size,
      };
    },
  };
}
