// 共有ポップオーバー。Claude Code の artifact ページヘッダーにある Share メニュー相当。
// 共有 URL 行（+ コピー）とバージョン履歴を 1 枚にまとめる。
// pagebox では view.* サブドメインに UI を注入できない（XSS 隔離）ため、
// この「artifact ページヘッダー相当」は一覧ページの DocCard 上に開く。
// 中身（VersionList + VersionRow）は用途で異なるため children で受ける。
import { Button } from "./Button";

interface SharePopoverProps {
  // 共有 URL（常に最新版を指す）
  url: string;
  children?: any;
  // id などをそのまま透過させる
  [key: string]: any;
}

export function SharePopover(props: SharePopoverProps) {
  const { url, children, ...rest } = props;
  return (
    <div class="share-popover" {...rest}>
      <div class="share-url-row">
        <a class="share-url" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
        <Button variant="primary" type="button" data-copy-url={url}>コピー</Button>
      </div>
      {children}
    </div>
  );
}
