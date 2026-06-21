// デザインシステムの live なリファレンスページ。
// セクションの枠組み（見出し等）だけを持ち、中身は catalog.tsx（見本の単一の正）を描画する。
// 同じ catalog を DesignSync カード生成（build-ds-cards）も描画するため、両者はドリフトしない。
import { SiteHeader } from "./components/SiteHeader";
import {
  ColorSwatches,
  SpacingScale,
  FontSizeScale,
  FontWeightScale,
  RadiusSwatches,
  ButtonExamples,
  BadgeExamples,
  StatCardExamples,
  DocCardExample,
  UiPatternExamples,
} from "./catalog";

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
          <ColorSwatches />
        </section>

        {/* (b) Spacing */}
        <section class="dashboard-section">
          <h2 class="section-heading">Spacing</h2>
          <SpacingScale />
        </section>

        {/* (c) Typography */}
        <section class="dashboard-section">
          <h2 class="section-heading">Typography</h2>

          <h3 class="sub-heading">Font size</h3>
          <FontSizeScale />

          <h3 class="sub-heading sg-spaced-heading">Font weight</h3>
          <FontWeightScale />
        </section>

        {/* (d) Radius */}
        <section class="dashboard-section">
          <h2 class="section-heading">Radius</h2>
          <RadiusSwatches />
        </section>

        {/* (e) Components */}
        <section class="dashboard-section">
          <h2 class="section-heading">Components</h2>

          <h3 class="sub-heading">Button</h3>
          <ButtonExamples />

          <h3 class="sub-heading sg-spaced-heading">Badge</h3>
          <BadgeExamples />

          <h3 class="sub-heading sg-spaced-heading">StatCard</h3>
          <StatCardExamples />

          <h3 class="sub-heading sg-spaced-heading">Card</h3>
          <DocCardExample />

          <h3 class="sub-heading sg-spaced-heading">UI patterns</h3>
          <UiPatternExamples />
        </section>
      </main>
    </div>
  );
}
