// ドキュメント1件分のカード。Card（.doc-card シェル）の中に
// doc-info（title + meta）と doc-actions（操作ボタン群）を組み立てる。
// 実画面(home)・styleguide・DesignSync で同じ構造を共有する。
// actions は用途で異なる（home は開く/URLコピー/削除の動的ボタン、見本は静的）ため slot で受ける。
// id / key などは rest で Card に透過させ、home の #doc-${slug} 接点を保持する。
import { Card } from "./Card";

interface DocCardProps {
  title: any;
  meta: any;
  // doc-actions に入れる要素（ボタン群など）
  actions?: any;
  // id / key などをそのまま Card へ透過させる
  [key: string]: any;
}

export function DocCard(props: DocCardProps) {
  const { title, meta, actions, ...rest } = props;
  return (
    <Card {...rest}>
      <div class="doc-info">
        <div class="doc-title">{title}</div>
        <div class="doc-meta">{meta}</div>
      </div>
      <div class="doc-actions">{actions}</div>
    </Card>
  );
}
