// デザイントークン（src/design/tokens.ts）から CSS カスタムプロパティを生成する。
// serveStyle（Bun 経路）と scripts/build-css.ts（Workers ビルド経路）の両方が
// この renderCss() を共有することで、ローカルと本番で同一の CSS を保証する。
import { colors, space, fontSize, fontWeight, radius } from "../../design/tokens";

// textMuted → text-muted のように camelCase を kebab-case の CSS 変数名へ変換
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function colorBlock(set: Readonly<Record<string, string>>): string {
  return Object.entries(set)
    .map(([k, v]) => `  --${kebab(k)}: ${v};`)
    .join("\n");
}

// :root に出すスケール系トークン（space / font-size / font-weight / radius）
function scaleBlock(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(space)) lines.push(`  --space-${k}: ${v};`);
  for (const [k, v] of Object.entries(fontSize)) lines.push(`  --fs-${k}: ${v};`);
  for (const [k, v] of Object.entries(fontWeight)) lines.push(`  --fw-${k}: ${v};`);
  // 既存 CSS が --radius / --radius-sm を参照しているため互換名も併せて出す
  lines.push(`  --radius-sm: ${radius.sm};`);
  lines.push(`  --radius: ${radius.md};`);
  lines.push(`  --radius-md: ${radius.md};`);
  lines.push(`  --radius-pill: ${radius.pill};`);
  return lines.join("\n");
}

// :root（light + スケール）と [data-theme="dark"] のトークンブロックを生成
export function renderTokensCss(): string {
  return [
    ":root {",
    colorBlock(colors.light),
    scaleBlock(),
    "}",
    "",
    '[data-theme="dark"] {',
    colorBlock(colors.dark),
    "}",
  ].join("\n");
}

// トークン CSS + コンポーネント CSS を連結した最終 CSS を返す。
export function renderCss(componentsCss: string): string {
  return `${renderTokensCss()}\n\n${componentsCss}`;
}
