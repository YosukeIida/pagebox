// エラーメッセージ行の共通シェル（.error-msg）。
// hidden=true で .hidden を付与（home は初期非表示で client.ts が textContent を入れて表示する）。
// id 等は rest で透過させ #errorMsg 接点を保持する。

interface ErrorMsgProps {
  // 初期非表示にするか（home の #errorMsg は hidden 始まり）
  hidden?: boolean;
  children?: any;
  // id などをそのまま透過させる
  [key: string]: any;
}

export function ErrorMsg(props: ErrorMsgProps) {
  const { hidden, children, ...rest } = props;
  return (
    <p class={hidden ? "error-msg hidden" : "error-msg"} {...rest}>
      {children}
    </p>
  );
}
