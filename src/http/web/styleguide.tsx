// デザインシステムの live なリファレンスページ。
// tokens.ts の列挙と実コンポーネントの描画をそのまま見せることで、手動同期ゼロを保つ。
// スウォッチ等は var(--token) を参照するため、ダークモードにも自動追随する。
import { colors, space, fontSize, fontWeight, radius } from "../../design/tokens";
import { SiteHeader } from "./components/SiteHeader";
import { Button } from "./components/Button";
import { Badge } from "./components/Badge";
import { StatCard } from "./components/StatCard";
import { Card } from "./components/Card";

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

export function StyleguidePage(props: { email: string }) {
  return (
    <div>
      <SiteHeader email={props.email} />

      <main class="container dashboard-main">
        <h1 class="dashboard-title">styleguide</h1>
        <p class="panel-note sg-intro">
          tokens.ts と実コンポーネントをそのまま描画した live なリファレンス。
          色・寸法はすべて <code>var(--token)</code> 参照のためダークモードにも追随する。
        </p>

        {/* (a) Colors */}
        <section class="dashboard-section">
          <h2 class="section-heading">Colors</h2>
          <div class="sg-swatch-grid">
            {Object.entries(colors.light).map(([key, value]) => {
              const varName = `--${kebab(key)}`;
              return (
                <div class="sg-swatch" key={key}>
                  <div class="sg-swatch-color" style={`background: var(${varName})`}></div>
                  <div class="sg-swatch-meta">
                    <code class="sg-swatch-var">{varName}</code>
                    <span class="sg-swatch-value">{value}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* (b) Spacing */}
        <section class="dashboard-section">
          <h2 class="section-heading">Spacing</h2>
          <div class="sg-scale-list">
            {Object.entries(space).map(([key, value]) => (
              <div class="sg-row" key={key}>
                <code class="sg-row-label">--space-{key}</code>
                <div class="sg-bar" style={`width: var(--space-${key})`}></div>
                <span class="sg-row-value">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* (c) Typography */}
        <section class="dashboard-section">
          <h2 class="section-heading">Typography</h2>

          <h3 class="sub-heading">Font size</h3>
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

          <h3 class="sub-heading sg-spaced-heading">Font weight</h3>
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
        </section>

        {/* (d) Radius */}
        <section class="dashboard-section">
          <h2 class="section-heading">Radius</h2>
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
        </section>

        {/* (e) Components */}
        <section class="dashboard-section">
          <h2 class="section-heading">Components</h2>

          <h3 class="sub-heading">Button</h3>
          <div class="sg-row sg-component-row">
            <Button variant="primary" href="#">primary (a)</Button>
            <Button variant="secondary" href="#">secondary (a)</Button>
            <Button variant="danger" href="#">danger (a)</Button>
            <Button variant="primary" type="button">primary (button)</Button>
            <Button variant="secondary" type="button">secondary (button)</Button>
            <Button variant="danger" type="button">danger (button)</Button>
          </div>

          <h3 class="sub-heading sg-spaced-heading">Badge</h3>
          <div class="sg-row sg-component-row">
            <Badge variant="ok">ok</Badge>
            <Badge variant="ng">ng</Badge>
            <Badge variant="admin">admin</Badge>
          </div>

          <h3 class="sub-heading sg-spaced-heading">StatCard</h3>
          <div class="stat-grid">
            <StatCard label="ユーザー数" value="128" />
            <StatCard label="総ドキュメント数" value="1,024" />
            <StatCard label="エラー数 (7日)" value="3" error />
          </div>

          <h3 class="sub-heading sg-spaced-heading">Card</h3>
          <Card>
            <div class="doc-info">
              <div class="doc-title">サンプルドキュメント.pdf</div>
              <div class="doc-meta">2.4 MB · 2026年6月21日</div>
            </div>
            <div class="doc-actions">
              <Button variant="secondary" href="#">開く</Button>
              <Button variant="danger" type="button">削除</Button>
            </div>
          </Card>

          <h3 class="sub-heading sg-spaced-heading">UI patterns</h3>
          <div class="dropzone">
            <div class="dropzone-icon">📄</div>
            <p>ここに PDF を<strong>ドラッグ＆ドロップ</strong>、またはクリックして選択</p>
          </div>
          <div class="result-box">
            <span class="result-url">
              <a href="#">https://view.pagebox.iodine2.net/abc123</a>
            </span>
            <Button variant="primary" type="button">コピー</Button>
          </div>
          <p class="error-msg">アップロードに失敗しました。もう一度お試しください。</p>
        </section>
      </main>
    </div>
  );
}
