# pagebox — Claude Code 向けメモ

詳細は `HANDOVER.md` と `docs/` を参照。ここでは Claude Code が常に守るべき要点のみ。

## アーキテクチャ境界
- `core/`・`http/` は `adapters/`・`db/` を **import しない**（ports/adapters）。新しいストレージ/DB は `ports/` のインターフェースを実装し `config/container.ts` で配線する。
- **公開 URL を直書きしない。** `src/core/urls.ts` の `viewUrl()` / `ogImageUrl()` を使い、オリジンは `AppDeps.origins`（Workers は `APP_ORIGIN` / `VIEW_ORIGIN` の vars、Bun は `PAGEBOX_*_ORIGIN`）から注入する。本番と stage で値が違うため直書きすると stage が本番 URL を吐く。

## 環境
- Cloudflare は **本番と stage の2環境**（`wrangler.toml` の `[env.stage]`）。PR に `stage` ラベルを付けると CI が stage へ deploy する。stage の D1/R2/KV は PR 間で共有。詳細は `docs/deploy-stage.md`。
- **`wrangler.toml` の `routes` は環境に継承される。** `[env.stage].routes` を消すと stage の deploy が本番ドメインを奪う。`scripts/check-stage-config.ts` が routes・binding の本番重複・`TODO_` 残りを検証し、ローカルの `make stage-deploy` と CI の両方が deploy 前にこのゲートを通る（fail closed）。期待するホスト名やリソースを変えるときはこのスクリプトと `scripts/check-stage-config.test.ts` も更新する。
- 新しいロジックを足すときは `bun test`（`make test`）にテストを追加する。現状は `src/core/urls.ts` と stage 設定ガードを対象にしている。

## バージョン管理（データモデルの要点）
- 1 slug = **複数バージョン**。`documents` は共有 URL の単位＋最新版のスナップショット、履歴は `document_versions`（append-only、PK は `(slug, version)`）。
- blob のキーは版ごとに違う。**`${slug}.html` を組み立てず、必ず `document_versions.storage_key` を経由する**（導入前の既存オブジェクトは旧キーのまま残っている）。
- 共有 URL は常に最新版を配信する。過去版は `/:slug/vN`。「戻す」は複製して新しい最新版にする（過去版を消さない）。
- 公開 URL の組み立ては `src/core/urls.ts`（`viewUrl` / `ogImageUrl` / `parseViewPath`）に集約する。ハードコードしない。

## デザインシステム（重要）
- デザイントークンの正は `src/design/tokens.ts`。CSS は `src/http/web/css.ts` の `renderCss()` が生成し、Bun（`serveStyle`）と Workers ビルド（`scripts/build-css.ts`）で共有する。**生 hex / px を書かず、必ず `var(--token)` を使う。**
- UI は **Hono JSX（SSR・非 React）**。属性は `class`。再利用コンポーネントは `src/http/web/components/`。実物の一覧は `/styleguide`。
- **見本（styleguide / DesignSync カード）の markup は `src/http/web/catalog.tsx` が唯一の正。** `styleguide.tsx` と `scripts/build-ds-cards.tsx` は catalog の関数を描画/`String()` 化するだけの薄い consumer にすること（見本 markup を各所で手書きしない＝ドリフトさせない）。実画面の構造パターン（`DropZone`/`ResultBox`/`ErrorMsg`/`DocCard` 等）も `components/` のコンポーネントを使い、`home.tsx` と見本で共有する。
- **Figma からコードを起こすときは Code Connect が使えない（Education プラン）。`docs/figma-to-code-map.md` の対応表に従い、既存コンポーネント/トークンを再利用する（新規 markup を作らない）。**
- デザイン⇔コードのワークフローは `docs/design-workflow.md`、画面フローは `docs/flow.md`、方針は `docs/design.md`。

## 開発
- ローカルは Docker 経由（`make dev` で `localhost:3000`、`make typecheck`、`make ds-cards`）。bun/node のローカルインストールは不要（wrangler だけは Node、コンテナ内で実行）。
- 作業ブランチ: `feature/<name>` または `fix/<name>` → PR 経由で main にマージ（main へ直接 push しない）。
