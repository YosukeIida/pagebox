// 表面スタイル（surface + border + radius + shadow）を持つカードのラッパ。
// 既定では doc-card クラスを適用する。id / key 等は rest で透過させる。
// 無理に内部構造を共通化せず、利用側が children を組み立てる。

interface CardProps {
  // 適用するクラス（既定: doc-card）。他のカード系クラスにも流用可能。
  class?: string;
  children?: any;
  // id / key などをそのまま透過させる
  [key: string]: any;
}

export function Card(props: CardProps) {
  const { class: className = "doc-card", children, ...rest } = props;
  return (
    <div class={className} {...rest}>
      {children}
    </div>
  );
}
