# 引き継ぎ: デザインシステム化セッション (2026-06-21〜23)

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
| PR #6 コンポーネント参照階層の統一（catalog=単一の正）+ DesignSync 足場 | ✅ **merged (main)** | https://github.com/YosukeIida/pagebox/pull/6 |
| PR #7 nix devshell | ✅ **merged (main)** | Node 22 + Python 3.13 + uv |
| PR #8 `components.css` スケールトークン移行 | 🔵 **OPEN（要レビュー/マージ）** | https://github.com/YosukeIida/pagebox/pull/8 |
| figma-console-mcp（ローカル Figma MCP）導入・稼働 | ✅ end-to-end 確認 | nix 導入 + Desktop Bridge + 安定パス activation |
| Figma ファイル（**コードから全再構築**） | ✅ 変数41 + 全7コンポーネント変数バインド | https://www.figma.com/design/ZPiO5rFJit4OGXifCXrZhZ |
| Claude Design プロジェクト | ✅ push 済み | claude.ai/design「pagebox design system」（8 カード） |
| 設計判断・知見ノート | ✅ Obsidian 4本 | 個人 vault `obsidian-dagnetz` 2026/06/22〜23 |
| `cc-launch-workspace` skill 修正 | ✅ 完了 | `~/.claude/skills/cc-launch-workspace/`（個人 skill・本 repo 外） |

## 詳細

### 1. コード=正のデザインシステム（PR #5・merged）
- `src/design/tokens.ts` — トークンの単一ソース（color light/dark, space, fontSize, fontWeight, radius）。
- `src/http/web/css.ts` の **`renderCss()`** — tokens から `:root` / `[data-theme="dark"]` を生成し `components.css` に連結。
  **Bun(`serveStyle`) と Workers ビルド(`scripts/build-css.ts`) が共有**し、両経路で **byte 一致**を検証済み。
- `src/http/web/static/style.css` → **`components.css`** にリネーム。status/danger 色をトークン化。
- 再利用 JSX コンポーネント `src/http/web/components/`（Button / Card / Badge / StatCard / SiteHeader）。
- **`/styleguide`** — tokens 列挙 + 全コンポーネントを実 CSS から描画する live リファレンス。
- `docs/flow.md` / `docs/design.md`。

### 2. コンポーネント参照階層の統一（PR #6・merged）
当初は「DesignSync 足場」だったが、レビュー指摘（**見本 markup を各所で手書きコピーしておりドリフトする**）を受け目的を変更：
- **見本 markup の唯一の正を `src/http/web/catalog.tsx` に集約**。`styleguide.tsx` と `scripts/build-ds-cards.tsx` は catalog の関数を描画/`String()` 化するだけの**薄い consumer** に。
- 構造コンポーネント **`DropZone` / `ResultBox` / `ErrorMsg` / `DocCard`** を `components/` に抽出し、実画面 `home.tsx` と見本で共有。実画面の動的接点（`id`/`<input>`/`hidden`/`data-*`）は props で吸収し、**`client.ts` 接点は出力バイト保持を検証**（正規化 diff 空）。
- DesignSync で `make ds-cards` → `design-system/*.html`（8枚）を claude.ai/design へ push。
- **Code Connect 手動代替**: `docs/figma-to-code-map.md` + `CLAUDE.md`（catalog=見本の正、を明記）。
- 派生の OSS **Figma Console MCP** 導入手順は `docs/design-workflow.md §7`。

### 3. components.css スケールトークン移行（PR #8・OPEN）
- 旧 CSS の literal px / font-weight を、値が一致する `var(--space-*/fs-*/fw-*/radius*)` へ移行（CLAUDE.md「生 px を書かない」準拠）。
- **off-scale 値（6/10/20/40px・border 1/2px・max/min-width 等のレイアウト寸法・clamp 上限 2.5rem）は literal のまま**（対応トークンが無いため）。
- 検証: `renderCss()` 出力の `var()` を `:root` 値へ逆解決した **computed CSS が移行前後で完全一致**＝値保存・visual 不変。
- トークン化粒度の方針: 繰り返し/on-scale 値はトークン化、一回限り/レイアウト/border 値は literal で残す。

### 4. figma-console-mcp（ローカル Figma MCP）導入・稼働
- **無料プランでも Figma の read/write・design-system 抽出が可能**（Figma Plugin API ベース、Code Connect 不使用 → 独自の `figma_get_design_system_kit` 等）。サードパーティ OSS（southleft 製）。
- 導入: dotfiles `nix/home/packages.nix` の `buildNpmPackage` で導入（PATH に `figma-console-mcp`）→ `claude mcp add figma-console -s user -- figma-console-mcp`（stdio, user scope）。
- 使用には **Figma デスクトップアプリ + Desktop Bridge プラグイン（Run → 緑 READY）が必須**。プラグインは manifest を import する。
- **安定パス化（再 import 不要）**: dotfiles の `home.activation.figmaConsoleBridge` で `~/.figma-plugins/figma-desktop-bridge/` へ**実体コピー**（`cp -rL`、`darwin-switch` ごと更新）。Figma はそこから import すれば nix 再ビルドでハッシュが変わっても再 import 不要。**※この dotfiles 変更は未コミット。**
- Cloud ペアリング（6桁コード）は **Claude が別デバイスの場合のみ**で、同一 Mac のローカル運用では不要。
- REST 系ツール（file データ/版/画像）は **`FIGMA_ACCESS_TOKEN` 未設定で不可**（プラグイン系は PAT 不要で動く）。PAT は agenix 管理で zshenv にあるが MCP サーバに継承されていない。
- **新規 MCP のツールは Claude Code 再起動でロード**される（セッション途中追加では使えない）。接続確認は `figma_get_status`（probe:true）。

### 5. Figma ファイルをコードから全再構築（figma-console 経由）
ファイル `ZPiO5rFJit4OGXifCXrZhZ`「pagebox design system」を **tokens.ts / catalog を正に全再構築**：
- **変数**: `Colors`（Light/Dark 2モード・14色）+ `Scale`（space/fs/fw/radius・27）= 41個。CSS の `var(--NAME)` ↔ 同名 Figma 変数で 1:1。
- **コンポーネント**: Button / Badge / StatCard / DocCard / DropZone / ResultBox / ErrorMsg を**変数バインド**で構築（fills/strokes/padding/radius/fontSize）。Section「Components (code-synced)」内に縦 auto-layout で整列。
- 旧 Button/Badge は削除し作り直し。実装は **Sonnet 4.6 エージェントに委譲**し、Opus がスクショ + `boundVariables` 実データでレビュー。
- 近似点（code→Figma は Plugin API 翻訳＝DOM 再現ではない）: hover/`.drag-over`/transition 無し、📄 は白黒字形、monospace→Inter 代替、fontWeight は名前付きスタイル（数値 fw 変数はバインド不可＝参照用）、DocCard は固定幅。

### 6. 開発環境（PR #7・merged）
- `nix/flake.nix` + `flake.lock` + `.envrc`。**Node 22 + Python 3.13 + uv**。`cd pagebox` で direnv が devshell 自動有効化。

### 7. cmux 起動 skill 修正（`cc-launch-workspace`）
- claude 起動を **`cmux send --workspace <id> "claude\n"`（決定論的 RPC）** に変更（direnv 有効端末で起動・環境継承）。
- `cmux new-surface --type agent-session` は不使用。AppleScript キーストロークは不発しやすく最終手段。

## 重要な制約・知見
- **Code = 唯一の正**。値の再掲はしない（doc はポインタ）。生 hex/px を書かず `var(--token)`。UI は **Hono JSX（SSR・非 React、`class`）**。
- **3者の役割**: Code=正・配信される実体 / `/styleguide`=in-repo の Storybook（catalog の live カタログ）/ **Claude Design**=その鏡 + AI 生成（**生成物は“提案”であって正ではない**）/ **Figma**=人間デザイナー協働の副チャネル。
- **DesignSync の向き**: ツール仕様として **code → Claude Design の push**（read は差分計算用）。「Claude Design を正に code を上書き」する機能は無い＝**code=正**を前提に作られている。
- **取り込み（Figma / Claude Design → code）= import-at-creation**: 提案を作成時に1回だけ参照し code で再実装・確定。**双方向同期しない**（同一成果物の master は常に code 1つ）。
- **code → Figma のフィデリティ**: Plugin API で Figma ノードへ翻訳＝**近似**（hover/状態/絵文字/フォントは落ちる）。**Claude Design は実 HTML を描画するので忠実（DOM 一致）**。
- **figma-console**: 無料プランで write 可だが**毎回 Figma デスクトップ + Bridge 起動が必要**。プラグインの「Run」は外部から自動化できない（手動）。Run 直前まで（設定・アプリ起動）は自動化可。
- **公式 claude.ai Figma MCP**: クラウド実行でデスクトップアプリ不要・常時可。ただし **Code Connect は Organization/Enterprise + Dev/Full seat 必須**。
- **Claude Design**: モック生成 = claude.ai/design Web UI、DS 同期 = Claude Code（DesignSync / `/design-sync`）。Claude Pro/Max/Team/Enterprise 必要。
- ローカルに bun/node を入れない（Docker + nix devshell）。
- **詳細ノート（個人 vault `obsidian-dagnetz/01_data/`）**:
  - 2026/06/22「Code・Claude Design・Figma の関係と制約」「Claude Design と Figma のコード再現フィデリティ（実測）」「公式 Figma MCP とローカル Node 系 MCP・Code Connect の違い」
  - 2026/06/23「figma-console-mcp 導入・運用メモ（ローカル Figma MCP）」

## 次に必要なこと（TODO）
1. **PR #8 をレビュー/マージ**（`components.css` トークン移行）: https://github.com/YosukeIida/pagebox/pull/8
2. （任意）dotfiles の **figma-console 安定パス activation をコミット**（`nix/home/packages.nix`・現状未コミット）。
3. （任意）**Claude Design でモック生成** → `/design-sync` で pull → Hono JSX + components.css で実装（import-at-creation）。
4. （運用）Figma「Components (code-synced)」を更新したいとき: Figma デスクトップ + Desktop Bridge を Run → figma-console で再生成（コードが正）。
5. （将来）Code Connect が必要なら Figma を Organization/Enterprise + Dev/Full seat へ。
6. （製品）優先度中の機能: グループ招待 / ページネーション（`HANDOVER.md` 参照）。

## 検証コマンド
- `make typecheck` / `make dev`（`/`・`/styleguide`・`/admin`）/ `make ds-cards`
- CSS 経路一致: `make deploy` の `dist/static/style.css` が `serveStyle` 出力と一致（`renderCss()` 共有）。
- figma-console 接続確認: `figma_get_status`（probe:true）→ ✅ かつ Desktop Bridge READY。

## 関連ファイル
- 設計方針 `docs/design.md` / トークン `src/design/tokens.ts` / CSS 生成 `src/http/web/css.ts`
- 再利用コンポーネント `src/http/web/components/`（Button/Card/Badge/StatCard/SiteHeader + DropZone/ResultBox/ErrorMsg/DocCard）
- **見本の単一の正 `src/http/web/catalog.tsx`** / 実物 `/styleguide` / DesignSync 生成 `scripts/build-ds-cards.tsx`
- フロー `docs/flow.md` / ワークフロー `docs/design-workflow.md` / Figma↔コード `docs/figma-to-code-map.md` / Claude Code 規約 `CLAUDE.md`
