// バージョン履歴 1 行分。`v3 · 7月26日 12:30 · 24.1 KB · 最新` のメタ行と操作ボタン群。
// actions は用途で異なる（共有ポップオーバーでは開く/URLコピー/戻す、見本では静的）ため
// DocCard と同じ slot 方式で受ける。
import { formatDateTime, formatSize } from "../format";

interface VersionRowProps {
  version: number;
  createdAt: Date;
  size: number;
  // 最新版（= 共有 URL が指している版）かどうか
  latest?: boolean;
  // 「この版に戻す」で複製した元の版番号。あれば由来を表示する。
  sourceVersion?: number | null;
  actions?: any;
}

export function VersionRow(props: VersionRowProps) {
  const meta = [formatDateTime(props.createdAt), formatSize(props.size)];
  if (props.sourceVersion) meta.push(`v${props.sourceVersion} から復元`);

  return (
    <div class={props.latest ? "version-row version-row-latest" : "version-row"}>
      <div class="version-info">
        <span class="version-badge">v{props.version}</span>
        <span class="version-meta">{meta.join(" · ")}</span>
        {props.latest ? <span class="version-current">最新</span> : null}
      </div>
      <div class="version-actions">{props.actions}</div>
    </div>
  );
}
