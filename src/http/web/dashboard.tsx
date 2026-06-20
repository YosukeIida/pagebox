import type { AdminStats } from "../../ports/admin-repository";
import { SiteHeader } from "./components/SiteHeader";
import { StatCard } from "./components/StatCard";
import { Badge } from "./components/Badge";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(s: string): string {
  try {
    return new Date(s).toLocaleString("ja-JP", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export interface ViewStat {
  slug: string;
  title?: string;
  viewCount: number;
}

export interface CountryStat {
  country: string;
  viewCount: number;
}

export interface RefererStat {
  referer: string;
  viewCount: number;
}

export interface DailyView {
  date: string;
  viewCount: number;
}

export interface AnalyticsData {
  topDocuments: ViewStat[];
  topCountries: CountryStat[];
  topReferers: RefererStat[];
  totalViews: number;
  dailyViews: DailyView[];
}

export interface LoginEntry {
  userEmail: string;
  ipAddress: string;
  createdAt: string;
  allowed: boolean;
  appDomain: string;
}

export interface SystemData {
  requestsLast7d: number;
  errorsLast7d: number;
  cpuP50Ms: number | null;
  cpuP99Ms: number | null;
  d1ReadQueries: number;
  r2StorageBytes: number;
}

export interface DashboardProps {
  email: string;
  stats: AdminStats;
  analytics: AnalyticsData | null;
  logins: LoginEntry[] | null;
  system: SystemData | null;
}

export function DashboardPage(props: DashboardProps) {
  const { stats, analytics, logins, system } = props;
  const totalViews = analytics?.totalViews ?? null;

  return (
    <div>
      <SiteHeader email={props.email} showAdminBadge />

      <main class="container dashboard-main">
        <h1 class="dashboard-title">ダッシュボード</h1>

        {/* サマリーカード */}
        <div class="stat-grid">
          <StatCard label="ユーザー数" value={stats.userStats.length} />
          <StatCard label="総ドキュメント数" value={stats.totalDocCount} />
          <StatCard label="総ストレージ使用量" value={formatSize(stats.totalSize)} />
          <StatCard label="直近30日の閲覧数" value={totalViews !== null ? totalViews.toLocaleString() : "—"} />
        </div>

        {/* Panel 1: ユーザーアクティビティ */}
        <section class="dashboard-section">
          <h2 class="section-heading">ユーザーアクティビティ</h2>
          {stats.userStats.length === 0 ? (
            <p class="empty-label">ユーザーがいません</p>
          ) : (
            <div class="table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>メールアドレス</th>
                    <th>登録日</th>
                    <th>ドキュメント数</th>
                    <th>合計サイズ</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.userStats.map((u) => (
                    <tr key={u.email}>
                      <td class="email-cell">{u.email}</td>
                      <td>{formatDate(u.createdAt)}</td>
                      <td class="num-cell">{u.docCount}</td>
                      <td class="num-cell">{formatSize(u.totalSize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Panel 2: 直近アップロード */}
        <section class="dashboard-section">
          <h2 class="section-heading">直近アップロード</h2>
          {stats.recentDocs.length === 0 ? (
            <p class="empty-label">ドキュメントがありません</p>
          ) : (
            <div class="table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>タイトル</th>
                    <th>アップロード者</th>
                    <th>日時</th>
                    <th>サイズ</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentDocs.map((d) => (
                    <tr key={d.slug}>
                      <td>
                        <a
                          href={`https://view.pagebox.iodine2.net/${d.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="doc-link"
                        >
                          {d.title}
                        </a>
                      </td>
                      <td class="email-cell">{d.uploadedBy}</td>
                      <td>{formatDate(d.createdAt)}</td>
                      <td class="num-cell">{formatSize(d.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Panel 3: アクセス分析 */}
        <section class="dashboard-section">
          <h2 class="section-heading">アクセス分析 <span class="panel-note">（直近30日）</span></h2>
          {!analytics ? (
            <p class="empty-label cf-unavail">
              データを取得できませんでした（CLOUDFLARE_API_TOKEN の権限または Analytics Engine の設定を確認してください）
            </p>
          ) : (
            <div class="analytics-grid">
              <div>
                <h3 class="sub-heading">閲覧数ランキング</h3>
                {analytics.topDocuments.length === 0 ? (
                  <p class="empty-label">データなし（ドキュメントを閲覧するとデータが蓄積されます）</p>
                ) : (
                  <div class="table-wrap">
                    <table class="admin-table">
                      <thead><tr><th>ドキュメント</th><th>閲覧数</th></tr></thead>
                      <tbody>
                        {analytics.topDocuments.map((v) => (
                          <tr key={v.slug}>
                            <td>
                              <a href={`https://view.pagebox.iodine2.net/${v.slug}`} target="_blank" rel="noopener noreferrer" class="doc-link">
                                {v.slug}
                              </a>
                            </td>
                            <td class="num-cell">{v.viewCount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h3 class="sub-heading">国別</h3>
                {analytics.topCountries.length === 0 ? (
                  <p class="empty-label">データなし</p>
                ) : (
                  <div class="table-wrap">
                    <table class="admin-table">
                      <thead><tr><th>国</th><th>閲覧数</th></tr></thead>
                      <tbody>
                        {analytics.topCountries.map((c) => (
                          <tr key={c.country}>
                            <td>{c.country || "—"}</td>
                            <td class="num-cell">{c.viewCount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h3 class="sub-heading">リファラー</h3>
                {analytics.topReferers.length === 0 ? (
                  <p class="empty-label">データなし</p>
                ) : (
                  <div class="table-wrap">
                    <table class="admin-table">
                      <thead><tr><th>リファラー</th><th>閲覧数</th></tr></thead>
                      <tbody>
                        {analytics.topReferers.map((r) => (
                          <tr key={r.referer}>
                            <td>{r.referer || "直接"}</td>
                            <td class="num-cell">{r.viewCount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Panel 4: ログイン履歴 */}
        <section class="dashboard-section">
          <h2 class="section-heading">ログイン履歴</h2>
          {!logins ? (
            <p class="empty-label cf-unavail">
              データを取得できませんでした（CLOUDFLARE_API_TOKEN の権限を確認してください）
            </p>
          ) : logins.length === 0 ? (
            <p class="empty-label">ログイン履歴がありません</p>
          ) : (
            <div class="table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>メールアドレス</th>
                    <th>IP</th>
                    <th>日時</th>
                    <th>結果</th>
                  </tr>
                </thead>
                <tbody>
                  {logins.map((l, i) => (
                    <tr key={i}>
                      <td class="email-cell">{l.userEmail || "—"}</td>
                      <td class="mono-cell">{l.ipAddress || "—"}</td>
                      <td>{formatDateTime(l.createdAt)}</td>
                      <td>
                        <Badge variant={l.allowed ? "ok" : "ng"}>
                          {l.allowed ? "許可" : "拒否"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Panel 5: システム状態 */}
        <section class="dashboard-section">
          <h2 class="section-heading">システム状態 <span class="panel-note">（直近7日）</span></h2>
          {!system ? (
            <p class="empty-label cf-unavail">
              データを取得できませんでした（CLOUDFLARE_API_TOKEN の権限を確認してください）
            </p>
          ) : (
            <div class="stat-grid">
              <StatCard label="リクエスト数" value={system.requestsLast7d.toLocaleString()} />
              <StatCard
                label="エラー数"
                value={system.errorsLast7d.toLocaleString()}
                error={system.errorsLast7d > 0}
              />
              <StatCard label="CPU 時間 p50" value={system.cpuP50Ms !== null ? `${system.cpuP50Ms.toFixed(1)} ms` : "—"} />
              <StatCard label="CPU 時間 p99" value={system.cpuP99Ms !== null ? `${system.cpuP99Ms.toFixed(1)} ms` : "—"} />
              <StatCard label="D1 クエリ数" value={system.d1ReadQueries.toLocaleString()} />
              <StatCard label="R2 ストレージ" value={formatSize(system.r2StorageBytes)} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
