// 選択ダイアログの共通シェル（オーバーレイ + パネル + キャンセル/決定）。
// 本文は用途で異なるため children で受ける（同名検出では UpdateChoices が入る）。
// hidden=true で .hidden を付与（home は初期非表示で client.ts が出し入れする）。
// id / data-* は rest で透過させる。
import { Button } from "./Button";

interface ChoiceDialogProps {
  title: any;
  // 決定ボタンのラベル（既定: 決定）
  confirmLabel?: string;
  hidden?: boolean;
  // 画面全体を覆うオーバーレイをやめてその場に置く（styleguide / DesignSync の見本用）
  inline?: boolean;
  children?: any;
  // id などをそのまま透過させる
  [key: string]: any;
}

export function ChoiceDialog(props: ChoiceDialogProps) {
  const { title, confirmLabel = "決定", hidden, inline, children, ...rest } = props;
  const cls = ["choice-overlay"];
  if (inline) cls.push("choice-overlay-inline");
  if (hidden) cls.push("hidden");
  return (
    <div class={cls.join(" ")} {...rest}>
      <div class="choice-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <p class="choice-title">{title}</p>
        <div class="choice-body">{children}</div>
        <div class="choice-actions">
          <Button variant="secondary" type="button" data-choice-cancel>キャンセル</Button>
          <Button variant="primary" type="button" data-choice-confirm>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
