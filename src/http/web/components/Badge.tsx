// バッジ共通コンポーネント。
// variant を対応クラスへマップして <span> で描画する。
// admin は admin-badge クラスである点に注意（badge-admin ではない）。

type BadgeVariant = "ok" | "ng" | "admin" | "version";

const BADGE_CLASS: Record<BadgeVariant, string> = {
  ok: "badge-ok",
  ng: "badge-ng",
  admin: "admin-badge",
  // バージョン履歴の行と同じチップを使う（見た目を一箇所に保つ）
  version: "version-badge",
};

interface BadgeProps {
  variant: BadgeVariant;
  children?: any;
}

export function Badge(props: BadgeProps) {
  return <span class={BADGE_CLASS[props.variant]}>{props.children}</span>;
}
