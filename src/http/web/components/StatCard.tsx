// 統計値カード。dashboard のサマリーカード／システム状態カードと等価なマークアップを描画する。
// error が true のとき stat-value に stat-error を付与する。

interface StatCardProps {
  label: any;
  value: any;
  error?: boolean;
}

export function StatCard(props: StatCardProps) {
  return (
    <div class="stat-card">
      <div class="stat-label">{props.label}</div>
      <div class={props.error ? "stat-value stat-error" : "stat-value"}>{props.value}</div>
    </div>
  );
}
