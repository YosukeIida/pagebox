// Claude Design（DesignSync）用のプレビューカード束を design-system/ に生成する。
// 各ファイルは先頭行に `<!-- @dsCard group="..." -->` を持つ standalone HTML で、
// tokens + components.css を renderCss() でインラインするため単体で正しく描画される。
//
// 同期の度合いはセクションで異なる:
// - Foundations（colors/typography/spacing/radius）は tokens.ts を列挙、
//   Button/Badge/StatCard は実コンポーネントを描画する → 値・コンポーネント変更に
//   自動追随し手動同期ゼロ。
// - doc-card / dropzone / result-box / error-msg は実画面（home.tsx）・styleguide.tsx と
//   同じページパターンを写した静的マークアップ。これらはどのブランチでも未コンポーネント化
//   のため、styleguide.tsx と同様にここも手動で同期させる（実画面変更時は要更新）。
import { join } from "node:path";
import { mkdir, readdir, rm } from "node:fs/promises";
import { renderCss } from "../src/http/web/css";
import { colors, space, fontSize, fontWeight, radius } from "../src/design/tokens";
import { Button } from "../src/http/web/components/Button";
import { Badge } from "../src/http/web/components/Badge";
import { StatCard } from "../src/http/web/components/StatCard";

const componentsPath = join(import.meta.dir, "../src/http/web/static/components.css");
const outDir = join(import.meta.dir, "../design-system");
const tokenCss = renderCss(await Bun.file(componentsPath).text());

// css.ts と同一の camelCase→kebab 変換
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// radius は css.ts で互換名を出すため key → CSS 変数名のマップを明示
const RADIUS_VAR: Record<string, string> = { sm: "--radius-sm", md: "--radius", pill: "--radius-pill" };

// 1枚のカード HTML。先頭行に @dsCard マーカー、CSS をインライン。
function card(group: string, title: string, body: string): string {
  return `<!-- @dsCard group="${group}" -->
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
${tokenCss}
</style>
<style>
  body { margin: 0; padding: var(--space-xl); background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; line-height: 1.6; }
  .ds-card-title { font-size: var(--fs-xl); font-weight: var(--fw-bold); margin-bottom: var(--space-lg); }
  .ds-demo-row { display: flex; flex-wrap: wrap; gap: var(--space-md); align-items: center; }
</style>
</head>
<body>
<div class="ds-card-title">${title}</div>
${body}
</body>
</html>
`;
}

// --- Foundations（sg- クラスは components.css に既存） ---
const colorsBody =
  `<div class="sg-swatch-grid">` +
  Object.keys(colors.light)
    .map((key) => {
      const v = `--${kebab(key)}`;
      const isShadow = key === "shadow";
      const style = isShadow
        ? `box-shadow: var(${v}); background: var(--surface)`
        : `background: var(${v})`;
      return (
        `<div class="sg-swatch"><div class="sg-swatch-color" style="${style}"></div>` +
        `<div class="sg-swatch-meta"><code class="sg-swatch-var">${v}</code>` +
        `<span class="sg-swatch-value">light: ${colors.light[key as keyof typeof colors.light]}</span>` +
        `<span class="sg-swatch-value">dark: ${colors.dark[key as keyof typeof colors.dark]}</span></div></div>`
      );
    })
    .join("") +
  `</div>`;

const typographyBody =
  `<div class="sg-scale-list">` +
  Object.entries(fontSize)
    .map(
      ([k, val]) =>
        `<div class="sg-type-row"><div class="sg-row-meta"><code class="sg-row-label">--fs-${k}</code>` +
        `<span class="sg-row-value">${val}</span></div>` +
        `<span class="sg-type-sample" style="font-size: var(--fs-${k})">The quick brown fox</span></div>`,
    )
    .join("") +
  Object.entries(fontWeight)
    .map(
      ([k, val]) =>
        `<div class="sg-type-row"><div class="sg-row-meta"><code class="sg-row-label">--fw-${k}</code>` +
        `<span class="sg-row-value">${val}</span></div>` +
        `<span class="sg-type-sample" style="font-weight: var(--fw-${k})">The quick brown fox</span></div>`,
    )
    .join("") +
  `</div>`;

const spacingBody =
  `<div class="sg-scale-list">` +
  Object.entries(space)
    .map(
      ([k, val]) =>
        `<div class="sg-row"><code class="sg-row-label">--space-${k}</code>` +
        `<div class="sg-bar" style="width: var(--space-${k})"></div>` +
        `<span class="sg-row-value">${val}</span></div>`,
    )
    .join("") +
  `</div>`;

const radiusBody =
  `<div class="sg-swatch-grid">` +
  Object.entries(radius)
    .map(([k, val]) => {
      const v = RADIUS_VAR[k];
      return (
        `<div class="sg-swatch"><div class="sg-radius-box" style="border-radius: var(${v})"></div>` +
        `<div class="sg-swatch-meta"><code class="sg-swatch-var">${v}</code>` +
        `<span class="sg-swatch-value">${val}</span></div></div>`
      );
    })
    .join("") +
  `</div>`;

// --- Components（Button/Badge/StatCard は実コンポーネントを SSR 文字列化して描画） ---
const buttonsBody =
  `<div class="ds-demo-row">` +
  String(Button({ variant: "primary", href: "#", children: "primary" })) +
  String(Button({ variant: "secondary", href: "#", children: "secondary" })) +
  String(Button({ variant: "danger", href: "#", children: "danger" })) +
  String(Button({ variant: "primary", type: "button", children: "primary (button)" })) +
  String(Button({ variant: "secondary", type: "button", children: "secondary (button)" })) +
  `</div>`;

const badgesBody =
  `<div class="ds-demo-row">` +
  String(Badge({ variant: "ok", children: "ok" })) +
  String(Badge({ variant: "ng", children: "ng" })) +
  String(Badge({ variant: "admin", children: "admin" })) +
  `</div>`;

// doc-card / dropzone / result-box / error-msg は未コンポーネント化のページパターン。
// home.tsx・styleguide.tsx の手書きマークアップを写した静的版（手動同期・上のヘッダー参照）。
const docCard =
  `<div class="doc-card"><div class="doc-info">` +
  `<div class="doc-title">サンプルドキュメント.pdf</div>` +
  `<div class="doc-meta">2.4 MB · 2026年6月21日</div></div>` +
  `<div class="doc-actions">` +
  String(Button({ variant: "secondary", href: "#", children: "開く" })) +
  String(Button({ variant: "danger", type: "button", children: "削除" })) +
  `</div></div>`;

const cardsBody =
  docCard +
  `<div class="stat-grid" style="margin-top: var(--space-lg)">` +
  String(StatCard({ label: "ユーザー数", value: "128" })) +
  String(StatCard({ label: "総ドキュメント数", value: "1,024" })) +
  String(StatCard({ label: "エラー数 (7日)", value: "3", error: true })) +
  `</div>`;

const patternsBody =
  `<div class="dropzone"><div class="dropzone-icon">📄</div>` +
  `<p>ここに HTML を<strong>ドラッグ＆ドロップ</strong></p></div>` +
  `<div class="result-box" style="margin-top: var(--space-md)">` +
  `<span class="result-url"><a href="#">https://view.pagebox.iodine2.net/abc123</a></span>` +
  String(Button({ variant: "primary", type: "button", children: "コピー" })) +
  `</div>` +
  `<p class="error-msg">アップロードに失敗しました。</p>`;

const cards: Array<[string, string, string, string]> = [
  ["01-colors.html", "Foundations", "Colors", colorsBody],
  ["02-typography.html", "Foundations", "Typography", typographyBody],
  ["03-spacing.html", "Foundations", "Spacing", spacingBody],
  ["04-radius.html", "Foundations", "Radius", radiusBody],
  ["05-buttons.html", "Components", "Button", buttonsBody],
  ["06-badges.html", "Components", "Badge", badgesBody],
  ["07-cards.html", "Components", "Card / StatCard", cardsBody],
  ["08-patterns.html", "Components", "UI patterns", patternsBody],
];

// 生成前に既存の *.html を削除する。カードを削除・改名しても古い HTML が残らず、
// DesignSync へ取り残しが再送されるのを防ぐ（出力先は design-system/ のみ）。
await mkdir(outDir, { recursive: true });
for (const name of await readdir(outDir)) {
  if (name.endsWith(".html")) await rm(join(outDir, name));
}

for (const [file, group, title, body] of cards) {
  await Bun.write(join(outDir, file), card(group, title, body));
}
console.log(`[build-ds-cards] wrote ${cards.length} cards to ${outDir}`);
