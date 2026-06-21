// Claude Design（DesignSync）用のプレビューカード束を design-system/ に生成する。
// 各ファイルは先頭行に `<!-- @dsCard group="..." -->` を持つ standalone HTML で、
// tokens + components.css を renderCss() でインラインするため単体で正しく描画される。
//
// 中身は catalog.tsx（見本の単一の正）を String() 化して埋め込むだけ。styleguide ページも
// 同じ catalog を描画するため、両サーフェスは構造上ドリフトしない（手動同期ゼロ）。
import { join } from "node:path";
import { mkdir, readdir, rm } from "node:fs/promises";
import { renderCss } from "../src/http/web/css";
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
} from "../src/http/web/catalog";

const componentsPath = join(import.meta.dir, "../src/http/web/static/components.css");
const outDir = join(import.meta.dir, "../design-system");
const tokenCss = renderCss(await Bun.file(componentsPath).text());

// 1枚のカード HTML。先頭行に @dsCard マーカー、CSS をインライン。
// 横並び等のレイアウトは components.css（renderCss でインライン済み）の sg-* クラスを使う。
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
</style>
</head>
<body>
<div class="ds-card-title">${title}</div>
${body}
</body>
</html>
`;
}

// 各カードの中身は catalog の関数を String() 化して得る（markup を手書きしない）。
const cards: Array<[string, string, string, string]> = [
  ["01-colors.html", "Foundations", "Colors", String(ColorSwatches())],
  ["02-typography.html", "Foundations", "Typography", String(FontSizeScale()) + String(FontWeightScale())],
  ["03-spacing.html", "Foundations", "Spacing", String(SpacingScale())],
  ["04-radius.html", "Foundations", "Radius", String(RadiusSwatches())],
  ["05-buttons.html", "Components", "Button", String(ButtonExamples())],
  ["06-badges.html", "Components", "Badge", String(BadgeExamples())],
  ["07-cards.html", "Components", "Card / StatCard", String(DocCardExample()) + String(StatCardExamples())],
  ["08-patterns.html", "Components", "UI patterns", String(UiPatternExamples())],
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
