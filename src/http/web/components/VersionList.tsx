// バージョン履歴のコンテナ。行の組み立て（VersionRow）は呼び出し側が行い、
// ここは見出しと枠だけを持つ。
// 見出しは Claude の Share メニューの "Sharing version N" に相当する。

interface VersionListProps {
  // 共有 URL が指している版（= 最新版）
  currentVersion: number;
  children?: any;
}

export function VersionList(props: VersionListProps) {
  return (
    <div class="version-list">
      <p class="version-list-heading">バージョン {props.currentVersion} を共有中（最新）</p>
      {props.children}
    </div>
  );
}
