# 引き継ぎ: デザインシステム化セッション (2026-06-21〜22)

## 背景・目的

「ページのフロー／デザインが未ドキュメント・未デザインシステム化」という課題に対し、
**コードを単一ソース（source of truth）とするデザインシステム**を整え、フロー文書化、
さらに **Claude Design / Figma 連携** と開発環境（nix devshell）まで一通り構築した。
方針: source of truth はコードに置き、Figma / Claude Design は「探索・モック生成・橋渡し」の
**上に載せるレイヤー**とする（Figma を正にした移行はドリフトを移すだけなので採らない）。

## 成果サマリ

| 項目 | 状態 | 場所 / 参照 |
|---|---|---|
| PR #5 デザインシステム基盤 | ✅ **merged (main)** | tokens / css 生成 / components / styleguide / flow |
| PR #6 Claude Design 連携 + Code Connect 代替 | 🔵 **OPEN（要レビュー/マージ）** | https://github.com/YosukeIida/pagebox/pull/6 |
| PR #7 nix devshell | ✅ **merged (main)** | Node 22 + Python 3.13 + uv |
| Claude Design プロジェクト | ✅ push 済み | claude.ai/design「pagebox design system」（8 カード） |
| Figma ファイル（変数+コンポーネント） | ✅ 作成済み | https://www.figma.com/design/ZPiO5rFJit4OGXifCXrZhZ （TMLlab drafts） |
| `cc-launch-workspace` skill 修正 | ✅ 完了 | `~/.claude/skills/cc-launch-workspace/`（個人 skill・本 repo 外） |

## 詳細

### 1. コード=正のデザインシステム（PR #5・merged）
- `src/design/tokens.ts` — トークンの単一ソース（color light/dark, space, fontSize, fontWeight, radius）。
- `src/http/web/css.ts` の **`renderCss()`** — tokens から `:root` / `[data-theme="dark"]` を生成し `components.css` に連結。
  **Bun(`serveStyle`) と Workers ビルド(`scripts/build-css.ts`) が共有**し、両経路で **byte 一致**を検証済み（新ドリフトを作らない）。
- `src/http/web/static/style.css` → **`components.css`** にリネーム（トークンブロックは生成側へ）。
- status/danger 色をトークン化（生 hex 排除）。`og-image.ts` の色も tokens 参照に統合。
- 再利用 JSX コンポーネント抽出 `src/http/web/components/`（Button / Card / Badge / StatCard / SiteHeader）。home/dashboard/layout のインラインスタイル排除。
- **`/styleguide`**（要ログイン）— tokens 列挙のスウォッチ + 全コンポーネントを実 CSS から描画する live リファレンス。
- `docs/flow.md` 新規（Mermaid ルート図 + ルート表 + ジャーニー）。`docs/design.md` を現状に同期（値の再掲をやめ tokens.ts / styleguide を指す）。

### 2. Claude Design 連携（PR #6・OPEN）
- `scripts/build-ds-cards.tsx` + **`make ds-cards`** → `design-system/*.html`（`@dsCard` マーカー付き standalone HTML 8 枚）を tokens + 実コンポーネントから生成（手動同期ゼロ・`design-system/` は gitignore）。
- **DesignSync で claude.ai/design へ push 済み**（プロジェクト「pagebox design system」、8 カード、表示確認済み）。
- `docs/design-workflow.md` — Claude Design / Figma の再利用ワークフロー文書。
- **Code Connect の手動代替**（Education プランは Code Connect 不可なため）:
  - `docs/figma-to-code-map.md` — Figma 変数/コンポーネント → コードの対応表 + 再利用ルール。
  - `CLAUDE.md`（repo 直下）— Claude Code が自動ロードする規約（ports/adapters 境界・DS 再利用・figma-to-code-map 参照・ブランチ運用）。
- `docs/design-workflow.md §7` — OSS **Figma Console MCP** の導入手順（未セットアップ）。

### 3. Figma 連携（外部・検証）
- ファイル: `ZPiO5rFJit4OGXifCXrZhZ`（TMLlab drafts）。color 変数 14（Light/Dark 2 モード）+ scale 変数 26 + Button/Badge コンポーネント（塗り・文字色を color 変数にバインド、ダーク追随を確認）。
- **検証結果（student tier）**: ライブラリ生成 ✅ / 自動逆生成 `generate_figma_design` ⚠️ この MCP 接続に未露出 / **Code Connect ❌ Org/Enterprise 必須（student 不可、`add_code_connect_map` がプラン要求エラー）**。

### 4. 開発環境（PR #7・merged）
- `nix/flake.nix` + `nix/flake.lock` + `.envrc`（`use flake ./nix`）。**Node 22 + Python 3.13 + uv**。
- `cd pagebox` で direnv が devshell を自動有効化（node/npx 使用可）。**既存端末は `direnv reload`、または新規端末**で反映。

### 5. cmux 起動 skill 修正（`cc-launch-workspace`）
- claude 起動を **`cmux send --workspace <id> "claude\n"`（決定論的 RPC）** に変更。
  → workspace の **direnv 有効ターミナルで claude を起動**＝操作できる端末 TUI ＋ devshell（node/npx）継承。実証済み。
- ❌ `cmux new-surface --type agent-session --provider claude` は不使用（cmux 管理の React サーフェス「Claude Code · React」になり操作困難・環境非継承）。
- AppleScript キーストロークは OS フォーカス依存で不発しやすく、最終手段に降格。

## 重要な制約・知見
- **Code = 正**。値の再掲はしない（design.md / 各 doc はポインタ）。生 hex/px を書かず `var(--token)`。UI は **Hono JSX（SSR・非 React、`class`）**。
- **Figma student tier**: Code Connect 不可（Org/Enterprise + Dev/Full seat 必須）。MCP 自体とライブラリ生成は可。
- **Claude Design**: DS 同期 = Claude Code（DesignSync / `/design-sync`）、モック生成 = claude.ai/design の Web UI。Claude Pro/Max/Team/Enterprise 必要。
- **cmux で操作できる claude**: `cmux send "claude\n"`（端末・devshell 継承）。agent-session は避ける。
- ローカルに bun/node を入れない（Docker + nix devshell）。wrangler のみ Node（コンテナ内 `node:20-slim`）。

## 次に必要なこと（TODO）
1. **PR #6 をレビュー/マージ**（最優先）: https://github.com/YosukeIida/pagebox/pull/6
2. （任意）**Figma Console MCP セットアップ**: Figma PAT 作成 → pagebox 内で `claude` 起動（devshell 継承）→ `claude mcp add figma-console -s user -e FIGMA_ACCESS_TOKEN=figd_xxx -e ENABLE_MCP_APPS=true -- npx -y figma-console-mcp@latest` → Figma デスクトップで Desktop Bridge プラグイン取り込み。詳細 `docs/design-workflow.md §7`。
3. （任意）**Claude Design でモック生成**: claude.ai/design でモック → `/design-sync` で pull → Hono JSX + components.css で実装。
4. （任意）`components.css` の spacing/typography を**スケールトークンへ移行**（現状トークンは定義済みだが旧 CSS は literal のまま。`/styleguide` と新コンポーネントは新トークン使用）。
5. （将来）Code Connect が必要なら Figma を Organization/Enterprise プランへ。

## 検証コマンド
- `make typecheck` / `make dev`（`localhost:3000` で `/`・`/styleguide`・`/admin`）/ `make ds-cards`
- CSS 経路一致: `make deploy` のビルド成果物 `dist/static/style.css` が `serveStyle` 出力と一致すること（`renderCss()` 共有）

## 関連ファイル
- 設計方針 `docs/design.md` / トークン `src/design/tokens.ts` / CSS 生成 `src/http/web/css.ts` / コンポーネント `src/http/web/components/` / 実物 `/styleguide` / フロー `docs/flow.md` / ワークフロー `docs/design-workflow.md` / Figma↔コード `docs/figma-to-code-map.md` / Claude Code 規約 `CLAUDE.md`
