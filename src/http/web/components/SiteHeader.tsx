// home / dashboard 共通のサイトヘッダー。
// showAdminBadge が true のときロゴ横に admin バッジを表示する（dashboard 用）。
// 右側は常に user-email + テーマ切替ボタン。id="themeToggle" は client.ts が参照するため厳守。
import { Badge } from "./Badge";

interface SiteHeaderProps {
  email: string;
  // ロゴ横に admin バッジを表示するか（dashboard で true）
  showAdminBadge?: boolean;
}

export function SiteHeader(props: SiteHeaderProps) {
  return (
    <header class="site-header">
      <div class="container site-header-inner">
        {props.showAdminBadge ? (
          <div class="header-brand">
            <a href="/" class="site-logo">pagebox</a>
            <Badge variant="admin">admin</Badge>
          </div>
        ) : (
          <a href="/" class="site-logo">pagebox</a>
        )}
        <div class="header-actions">
          <span class="user-email">{props.email}</span>
          <button class="theme-toggle" id="themeToggle">🌙</button>
        </div>
      </div>
    </header>
  );
}
