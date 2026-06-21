// ドロップゾーンの共通シェル（.dropzone + .dropzone-icon + 本文）。
// 本文（children）は用途で異なる: 実画面(home)は操作テキスト + <input>、
// styleguide / DesignSync は静的な見本テキスト。構造（シェル）はここに一本化する。
// id / role / tabindex / aria-* は rest で透過させ、home の client.ts 接点（#dropzone）を保持する。

interface DropZoneProps {
  // アイコン絵文字（既定: 📄）
  icon?: string;
  children?: any;
  // id / role / tabindex / aria-label などをそのまま透過させる
  [key: string]: any;
}

export function DropZone(props: DropZoneProps) {
  const { icon = "📄", children, ...rest } = props;
  return (
    <div class="dropzone" {...rest}>
      <div class="dropzone-icon">{icon}</div>
      {children}
    </div>
  );
}
