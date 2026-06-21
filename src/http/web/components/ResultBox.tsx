// アップロード結果ボックスの共通シェル（.result-box）。
// 中身（URL リンク + アクション）は用途で異なるため children で受ける。
// hidden=true で .hidden を付与（home は初期非表示で client.ts が出し入れする）。
// id 等は rest で透過させ #result 接点を保持する。

interface ResultBoxProps {
  // 初期非表示にするか（home の #result は hidden 始まり）
  hidden?: boolean;
  children?: any;
  // id などをそのまま透過させる
  [key: string]: any;
}

export function ResultBox(props: ResultBoxProps) {
  const { hidden, children, ...rest } = props;
  return (
    <div class={hidden ? "result-box hidden" : "result-box"} {...rest}>
      {children}
    </div>
  );
}
