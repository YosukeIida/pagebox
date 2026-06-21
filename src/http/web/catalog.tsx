// デザインシステムのカタログ（見本の単一の正）。
// styleguide ページ（SSR）と DesignSync カード生成（build-ds-cards, HTML 文字列化）の
// 両方がこれを描画するため、両サーフェスの見本は構造上ドリフトしない。
// Foundations は tokens.ts を列挙し、Components / Patterns は実コンポーネントを描画する。
// kebab / RADIUS_VAR もここに一本化する（旧 styleguide / build-ds-cards の二重定義を排除）。
import { colors, space, fontSize, fontWeight, radius } from "../../design/tokens";
import { Button } from "./components/Button";
import { Badge } from "./components/Badge";
import { StatCard } from "./components/StatCard";
import { DocCard } from "./components/DocCard";
import { DropZone } from "./components/DropZone";
import { ResultBox } from "./components/ResultBox";
import { ErrorMsg } from "./components/ErrorMsg";

// camelCase → kebab-case（css.ts の kebab と同一規則）。CSS 変数名の生成に使う。
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// radius は css.ts で互換名を出すため、key → CSS 変数名のマップを明示する。
// （sm → --radius-sm, md → --radius, pill → --radius-pill）
const RADIUS_VAR: Record<keyof typeof radius, string> = {
  sm: "--radius-sm",
  md: "--radius",
  pill: "--radius-pill",
};

// --- Foundations（tokens.ts を列挙。色・寸法はすべて var(--token) 参照） ---

export function ColorSwatches() {
  return (
    <div class="sg-swatch-grid">
      {Object.keys(colors.light).map((key) => {
        const varName = `--${kebab(key)}`;
        const lightVal = colors.light[key as keyof typeof colors.light];
        const darkVal = colors.dark[key as keyof typeof colors.dark];
        // shadow は色ではなく box-shadow 値なので、background ではなく影として見せる
        const isShadow = key === "shadow";
        const swatchStyle = isShadow
          ? `box-shadow: var(${varName}); background: var(--surface)`
          : `background: var(${varName})`;
        return (
          <div class="sg-swatch" key={key}>
            <div class="sg-swatch-color" style={swatchStyle}></div>
            <div class="sg-swatch-meta">
              <code class="sg-swatch-var">{varName}</code>
              <span class="sg-swatch-value">light: {lightVal}</span>
              <span class="sg-swatch-value">dark: {darkVal}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SpacingScale() {
  return (
    <div class="sg-scale-list">
      {Object.entries(space).map(([key, value]) => (
        <div class="sg-row" key={key}>
          <code class="sg-row-label">--space-{key}</code>
          <div class="sg-bar" style={`width: var(--space-${key})`}></div>
          <span class="sg-row-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function FontSizeScale() {
  return (
    <div class="sg-scale-list">
      {Object.entries(fontSize).map(([key, value]) => (
        <div class="sg-type-row" key={key}>
          <div class="sg-row-meta">
            <code class="sg-row-label">--fs-{key}</code>
            <span class="sg-row-value">{value}</span>
          </div>
          <span class="sg-type-sample" style={`font-size: var(--fs-${key})`}>
            The quick brown fox
          </span>
        </div>
      ))}
    </div>
  );
}

export function FontWeightScale() {
  return (
    <div class="sg-scale-list">
      {Object.entries(fontWeight).map(([key, value]) => (
        <div class="sg-type-row" key={key}>
          <div class="sg-row-meta">
            <code class="sg-row-label">--fw-{key}</code>
            <span class="sg-row-value">{value}</span>
          </div>
          <span class="sg-type-sample" style={`font-weight: var(--fw-${key})`}>
            The quick brown fox
          </span>
        </div>
      ))}
    </div>
  );
}

export function RadiusSwatches() {
  return (
    <div class="sg-swatch-grid">
      {Object.entries(radius).map(([key, value]) => {
        const varName = RADIUS_VAR[key as keyof typeof radius];
        return (
          <div class="sg-swatch" key={key}>
            <div class="sg-radius-box" style={`border-radius: var(${varName})`}></div>
            <div class="sg-swatch-meta">
              <code class="sg-swatch-var">{varName}</code>
              <span class="sg-swatch-value">{value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Components / Patterns（実コンポーネントの見本。横並びは共有 CSS の sg-row を使う） ---

export function ButtonExamples() {
  return (
    <div class="sg-row sg-component-row">
      <Button variant="primary" href="#">primary (a)</Button>
      <Button variant="secondary" href="#">secondary (a)</Button>
      <Button variant="danger" href="#">danger (a)</Button>
      <Button variant="primary" type="button">primary (button)</Button>
      <Button variant="secondary" type="button">secondary (button)</Button>
      <Button variant="danger" type="button">danger (button)</Button>
    </div>
  );
}

export function BadgeExamples() {
  return (
    <div class="sg-row sg-component-row">
      <Badge variant="ok">ok</Badge>
      <Badge variant="ng">ng</Badge>
      <Badge variant="admin">admin</Badge>
    </div>
  );
}

export function StatCardExamples() {
  return (
    <div class="stat-grid">
      <StatCard label="ユーザー数" value="128" />
      <StatCard label="総ドキュメント数" value="1,024" />
      <StatCard label="エラー数 (7日)" value="3" error />
    </div>
  );
}

export function DocCardExample() {
  return (
    <DocCard
      title="サンプルドキュメント.html"
      meta="2.4 MB · 2026年6月21日"
      actions={
        <>
          <Button variant="secondary" href="#">開く</Button>
          <Button variant="danger" type="button">削除</Button>
        </>
      }
    />
  );
}

export function UiPatternExamples() {
  return (
    <>
      <DropZone>
        <p>ここに HTML を<strong>ドラッグ＆ドロップ</strong>、またはクリックして選択</p>
      </DropZone>
      <ResultBox>
        <span class="result-url">
          <a href="#">https://view.pagebox.iodine2.net/abc123</a>
        </span>
        <Button variant="primary" type="button">コピー</Button>
      </ResultBox>
      <ErrorMsg>アップロードに失敗しました。もう一度お試しください。</ErrorMsg>
    </>
  );
}
