# pagebox — Claude Code 向けメモ

詳細は `HANDOVER.md` と `docs/` を参照。ここでは Claude Code が常に守るべき要点のみ。

## アーキテクチャ境界
- `core/`・`http/` は `adapters/`・`db/` を **import しない**（ports/adapters）。新しいストレージ/DB は `ports/` のインターフェースを実装し `config/container.ts` で配線する。

## デザインシステム（重要）
- デザイントークンの正は `src/design/tokens.ts`。CSS は `src/http/web/css.ts` の `renderCss()` が生成し、Bun（`serveStyle`）と Workers ビルド（`scripts/build-css.ts`）で共有する。**生 hex / px を書かず、必ず `var(--token)` を使う。**
- UI は **Hono JSX（SSR・非 React）**。属性は `class`。再利用コンポーネントは `src/http/web/components/`。実物の一覧は `/styleguide`。
- **見本（styleguide / DesignSync カード）の markup は `src/http/web/catalog.tsx` が唯一の正。** `styleguide.tsx` と `scripts/build-ds-cards.tsx` は catalog の関数を描画/`String()` 化するだけの薄い consumer にすること（見本 markup を各所で手書きしない＝ドリフトさせない）。実画面の構造パターン（`DropZone`/`ResultBox`/`ErrorMsg`/`DocCard` 等）も `components/` のコンポーネントを使い、`home.tsx` と見本で共有する。
- **Figma からコードを起こすときは Code Connect が使えない（Education プラン）。`docs/figma-to-code-map.md` の対応表に従い、既存コンポーネント/トークンを再利用する（新規 markup を作らない）。**
- デザイン⇔コードのワークフローは `docs/design-workflow.md`、画面フローは `docs/flow.md`、方針は `docs/design.md`。

## 開発
- ローカルは Docker 経由（`make dev` で `localhost:3000`、`make typecheck`、`make ds-cards`）。bun/node のローカルインストールは不要（wrangler だけは Node、コンテナ内で実行）。
- 作業ブランチ: `feature/<name>` または `fix/<name>` → PR 経由で main にマージ（main へ直接 push しない）。
