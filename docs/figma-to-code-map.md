# Figma → コード マッピング（Code Connect の手動代替）

pagebox の Figma プラン（Education/student）では **Code Connect が使えない**（Organization/Enterprise 限定）。
このファイルが Code Connect の手動版。Figma の variables / コンポーネントを、コードのどこに対応させるかを記す。

**Figma デザインからコードを起こすとき**（Figma MCP の `get_design_context` / `get_variable_defs` / `get_screenshot` 利用時）は、
**新規に markup を作らず、必ず下記の既存コード資産を再利用すること。**

## デザイントークン（Figma variables → CSS 変数）

正は `src/design/tokens.ts`。Figma 変数名はコードのトークン名に一致させてある（これが Code Connect 不要のトークン橋渡し。`get_variable_defs` が返す名前をそのまま使う）。

| Figma collection | Figma 変数名 | コードの CSS 変数 |
|---|---|---|
| color（Light/Dark 2モード） | `bg` `surface` `border` `text` `text-muted` `accent` `accent-hover` `accent-text` `overlay` `danger` `danger-text` `success-bg` `success-fg` `error-bg` `error-fg` | `var(--<同名>)` |
| scale | `space/xs`..`space/4xl` | `var(--space-xs)`..`var(--space-4xl)` |
| scale | `radius/sm` `radius/md` `radius/pill` | `var(--radius-sm)` `var(--radius)` `var(--radius-pill)` |
| scale | `font-size/*` | `var(--fs-*)` |
| scale | `font-weight/*` | `var(--fw-*)` |

- ルール: 生 hex / px を書かず、必ず `var(--token)`。新トークンが要るときは `tokens.ts` に追記（`renderCss()` が自動で CSS 変数化）。

## コンポーネント（Figma → コード）

| Figma コンポーネント | コード | 使い方 |
|---|---|---|
| `Button`（variant=primary/secondary/danger） | `src/http/web/components/Button.tsx` | `<Button variant="primary\|secondary\|danger" href? ...>` |
| `Badge`（variant=ok/ng/admin/version） | `src/http/web/components/Badge.tsx` | `<Badge variant="ok\|ng\|admin\|version">`（version は `.version-badge` を使う） |
| `StatCard` | `src/http/web/components/StatCard.tsx` | `<StatCard label={…} value={…} error? />` |
| `Card`（doc-card 表面） | `src/http/web/components/Card.tsx` | `<Card>…</Card>` |
| `DocCard` | `src/http/web/components/DocCard.tsx` | `<DocCard title={…} meta={…} actions={…} />` |
| `SiteHeader` | `src/http/web/components/SiteHeader.tsx` | `<SiteHeader email={…} showAdminBadge? />` |
| `DropZone` / `ResultBox` / `ErrorMsg` | `src/http/web/components/` の同名ファイル | アップロード画面の構造パターン |
| `SharePopover`（共有メニュー） | `src/http/web/components/SharePopover.tsx` | `<SharePopover url={…}>…</SharePopover>`。位置決めは利用側の `.share-host` が持つ |
| `VersionList` / `VersionRow` | `src/http/web/components/VersionList.tsx` / `VersionRow.tsx` | バージョン履歴。行の `actions` は `DocCard` と同じ slot 方式 |
| `ChoiceDialog` | `src/http/web/components/ChoiceDialog.tsx` | 選択ダイアログの殻。`inline` で見本用にその場置きにできる |
| `UpdateChoices` | `src/http/web/components/UpdateChoices.tsx` | 同名検出の選択肢（ラジオ行）。`POST /api/upload/check` の `candidatesHtml` としても SSR される |

## 実装ルール（Figma から起こすとき）

1. 既存の `src/http/web/components/*` を**先に確認**し、一致するものは**拡張して再利用**（新規乱造禁止）。
2. 色・余白・角丸・文字は `var(--token)` 参照。生値禁止。
3. Hono JSX（SSR・**非 React**）で実装。属性は `class`（`className` ではない）。
4. 新コンポーネントは `src/http/web/components/` に作り、`/styleguide` に追加し、この表にも追記する。
5. 確認は `make typecheck` + `make dev`（`/styleguide` で目視）。

実物の見本は `/styleguide`、トークンの正は `src/design/tokens.ts`、ワークフローは `docs/design-workflow.md`、画面フローは `docs/flow.md`。
