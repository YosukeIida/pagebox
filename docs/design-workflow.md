# デザイン⇔コード ワークフロー

このドキュメントは **Claude Design（DesignSync）と Figma を使ったデザイン⇔コードの連携手順**を記録する。
pagebox 固有の設定値も含むが、基本的な考え方は他プロジェクトでも再利用できる。

---

## 1. 基本思想

**source of truth はコードに置く。**

| レイヤー | 内容 | 役割 |
|---|---|---|
| `src/design/tokens.ts` | カラー・スペーシング・タイポグラフィ・角丸の値 | **正（Single Source of Truth）** |
| `src/http/web/components/` | Hono JSX コンポーネント（Button・Badge・Card 等） | **正** |
| `src/http/web/static/components.css` | コンポーネント CSS（`var(--token)` 参照） | **正** |
| Claude Design / Figma | 探索・モック生成・デザイン⇔コードの橋渡し | **上に載せるレイヤー** |

Figma をデザインの「正」にする waterfall 移行は **ドリフト問題を移すだけ**（Figma とコードの二重管理になる）。
デザインツールは「試す・見せる・精緻化する」ための道具として使い、確定値はコードにフィードバックする。

**pagebox は Hono JSX（SSR、非 React）**。
Claude Design の「GitHub repo から React コンポーネントを自動抽出」経路は精度が落ちるため、
DesignSync で明示的に**カード束（フレームワーク非依存の standalone HTML）**を送る方式を採る。
カード束は `tokens.ts` と実コンポーネントから描画されるので、手動同期は発生しない。

---

## 2. Claude Design ワークフロー（推奨・主軸）

### 役割分担

> **DS の配線 = Claude Code（DesignSync）／クリエイティブなモック生成 = Web UI**

Claude Code は「デザインシステムを同期する配線作業」のみを担う。
新しい画面やコンポーネントのモックを生成する創造的な作業は claude.ai/design のブラウザ UI で人間が行う。

### 手順

#### ステップ 1: カード束を生成する

```bash
make ds-cards
# 内部コマンド: docker run oven/bun:1 bun run build:ds-cards
```

`design-system/` ディレクトリに以下の 8 枚の standalone HTML が生成される。

| ファイル | グループ | 内容 |
|---|---|---|
| `01-colors.html` | Foundations | カラースウォッチ（light/dark） |
| `02-typography.html` | Foundations | フォントサイズ・ウェイトスケール |
| `03-spacing.html` | Foundations | スペーシングスケール |
| `04-radius.html` | Foundations | 角丸スケール |
| `05-buttons.html` | Components | Button（primary / secondary / danger） |
| `06-badges.html` | Components | Badge（ok / ng / admin） |
| `07-cards.html` | Components | doc-card・StatCard |
| `08-patterns.html` | Components | DropZone・result-box・error-msg |

各ファイルの先頭行は `<!-- @dsCard group="..." -->` マーカーを持ち、
CSS（`renderCss()` 生成の `:root` 変数 + `components.css`）をインラインしているため単体で正しく描画される。
**`design-system/` は .gitignore 済みの生成物**であり、git 管理外。

#### ステップ 2: Claude Design へ push する

Claude Code のセッションから `DesignSync` ツール（`/design-sync` スキル）を使い、
claude.ai/design のデザインシステムプロジェクトへ増分 push する。

```
/design-sync
```

内部フロー:

1. `list_projects` でプロジェクト一覧を取得
2. 対象プロジェクトが存在しなければ `create_project` で新規作成
3. `finalize_plan` でファイル差分を確認
4. `write_files` でカード束を push

**初回は claude.ai へのログイン認可が要求される（design スコープ付与）。**
`/design-login` スキルでブラウザを開き、承認を行う。

#### ステップ 3: Web UI でモック生成する

ブラウザで claude.ai/design を開き、push 済みのデザインシステムを参照しながら
新しい画面・機能を「既存 pagebox トーンのまま」生成・精緻化する。

- 会話でアイデアを伝えると Claude が pagebox のトークン・コンポーネントを使ったモックを生成する
- スライダーやインラインコメントで見た目を調整する
- 出力は**インタラクティブな HTML**（直接ブラウザで確認できる）

#### ステップ 4: 取り戻して実装する

`/design-sync` で更新を pull し、Claude Code が Hono JSX + `components.css` で実装する。

- モックの HTML を参照し、対応する Hono JSX コンポーネント・ルートを `src/http/web/` に追加
- 新しいトークン値が必要なら `src/design/tokens.ts` に追記し、`renderCss()` が自動で CSS 変数に変換する
- `make typecheck` で型チェックを通してから commit する

---

## 3. Figma ワークフロー（補助・ピクセル精度/チーム共有資産向け）

pagebox の現在のスケール（2画面・ソロ開発）では Figma の適用場面は限定的だが、
チームレビューやピクセル精度が求められる場面では有効。

### 前提

Figma MCP ツールを使う前に必ずスキルをロードする。

```
/figma-use
```

このスキルをロードせずに `use_figma` 等を呼ぶと正しく動作しない。

### 手順

#### ステップ 1: デザインライブラリを生成する（code→design）

`tokens.ts` を Figma variables に、`src/http/web/components/` を Figma コンポーネントに変換する。

```
/figma-generate-library
```

- `src/design/tokens.ts` のカラー・スペーシング・タイポグラフィ・角丸を Figma の Variables として登録する
- `Button`・`Badge`・`Card`・`StatCard`・`SiteHeader` を Figma コンポーネントとして作成する

#### ステップ 2: 実画面を Figma に逆生成する（code→design）

`make dev`（`docker compose up`）でローカルサーバー（localhost:3000）を起動したあと、
実画面を編集可能な Figma レイヤーとして取り込む。

```
/figma-generate-design
```

対象画面:

| URL | 画面名 |
|---|---|
| `http://localhost:3000/` | トップ（アップロード UI + ドキュメント一覧） |
| `http://localhost:3000/styleguide` | スタイルガイド（認証後） |
| `http://localhost:3000/admin` | 管理ダッシュボード（admin メール必要） |

#### ステップ 3: Code Connect を設定する（design↔code の紐付け）

Figma コンポーネントと `src/http/web/components/*` を `add_code_connect_map` で紐付ける。
設定後、Figma 上での AI 生成が「既存資産の再利用」を前提にする。

```
/figma-code-connect
```

> **注意**: Code Connect の publish は Figma の Org/Enterprise プランが前提。

### 検証結果（2026-06・student tier / TMLlab で実施）

| ステップ | 結果 | メモ |
|---|---|---|
| 1. ライブラリ生成 | ✅ 動作 | `pagebox design system` ファイルに color 変数（Light/Dark 2モード・14色）+ scale 変数（spacing/radius/font-size/font-weight 計26）+ Button/Badge コンポーネント（塗り・文字色を color 変数にバインド）を生成。ダークモード追随を確認。 |
| 2. 実画面の自動逆生成 | ⚠️ 不可 | 自動逆生成ツール（`generate_figma_design`）はこの MCP 接続に露出しておらず利用不可。画面を取り込む場合は `use_figma` で design-system コンポーネントから手組みする。 |
| 3. Code Connect | ❌ 不可 | **student tier では publish 不可**。`add_code_connect_map` が `"You need a Dev or Full seat on an Organization or Enterprise plan to use Code Connect"` を返す。Org/Enterprise + Dev/Full seat が必要。 |

→ **student tier での Figma 連携は「トークン→variables + コンポーネント生成」までが実用範囲**。Code Connect で「コードとデザインの双方向同期」を確立するには上位プランが要る。それまでは Claude Design（E）側のコード読み取りで代替するのが現実的。

#### Code Connect の手動代替（Education/Pro 向け）

Code Connect（Figma コンポーネント↔コードの自動マッピング）は Org/Enterprise 限定だが、その役割は**ルールファイル + 命名/変数名の一致**で手動代替できる（公式 `figma-create-design-system-rules` スキルも CLAUDE.md 生成という同じ発想）:
- **`docs/figma-to-code-map.md`** … Figma コンポーネント/変数 → コードの対応表 + 「既存を再利用、新規 markup を作らない」ルール（Code Connect の手動版）。
- **`CLAUDE.md`**（リポジトリ直下） … Claude Code が自動ロードする。上記マップと「`var(--token)` を使う／Hono JSX で実装」等の規約を要約。
- **トークン橋渡しは達成済み**: Figma 変数名をコードのトークン名に一致させてあるため、`get_variable_defs` が返す名前をそのまま使える（Code Connect 不要）。

---

## 4. 使い分け

| 軸 | Claude Design | Figma |
|---|---|---|
| **入力** | 自然言語 + コードリポジトリ（DS カード束） | 手動操作 + URL / 実ページキャプチャ |
| **出力** | インタラクティブ HTML → Claude Code 実装 | ベクターレイヤー → デザイン仕様書・共有資産 |
| **ユーザー** | 非デザイナー / ソロ開発者 | 訓練されたデザイナー / チーム |
| **強み** | 素早い探索・コードとの自動同期・自然言語での精緻化 | ピクセル精度・チームレビュー・ベクター編集 |
| **pagebox での位置づけ** | **主軸**（ソロ・非デザイナー・2画面） | **補助**（チーム共有や精度要件が出たとき） |

---

## 5. 前提・注意事項

- **Claude Design は Claude Pro/Max/Team/Enterprise プランが必要。** Free プランでは claude.ai/design が使えない。
- **DesignSync はトークン消費が大きい。** カード束の生成（`make ds-cards`）自体はローカルの Bun 実行なのでトークンを消費しないが、push・pull 操作は消費する。
- **Figma の canvas-to-agents は beta**（2026 年時点・将来有料化予定）。トークン消費が大きいため、モック生成の乱用は避ける。
- **生成物は必ずレビューしてから採用する。** トークン参照・コンポーネント構造・アクセシビリティ（alt・aria）を確認する。
- **ローカルに bun/node は不要。** Makefile の全コマンドは `docker run oven/bun:1` または `docker run node:20-slim` 経由で実行する。

---

## 6. 関連ファイル・リソース

| リソース | 場所 / URL |
|---|---|
| デザイン方針 | `docs/design.md` |
| デザイントークンの正 | `src/design/tokens.ts` |
| CSS 変数生成 | `src/http/web/css.ts`（`renderCss()`） |
| コンポーネント実装 | `src/http/web/components/` |
| DS カード生成スクリプト | `scripts/build-ds-cards.tsx` |
| Live コンポーネント確認 | `/styleguide`（ローカル: `make dev` 後 `localhost:3000/styleguide`） |
| Figma→コード マッピング（Code Connect 代替） | `docs/figma-to-code-map.md` |
| Claude Code 向けルール（自動ロード） | `CLAUDE.md` |
| 画面フロー | `docs/flow.md` |
| アーキテクチャ方針 | `docs/architecture.md` |

---

## 7. OSS 補完: Figma Console MCP（Code Connect 代替の一部）

Code Connect が使えない（Education/Pro）環境で、**トークン同期**と**デザイン⇔コードの差分検査**を補う OSS（`southleft/figma-console-mcp`、MIT）。Plugin API + Desktop Bridge 経由で動くため Enterprise REST API 不要、**Local Mode なら全プランで variables/トークンが動く**。

主なツール:
- `figma_export_tokens` — Figma variables → DTCG JSON / CSS 変数 / Tailwind / SCSS 等（差分マージ、`variableId` 埋め込みでラウンドトリップ安全）。
- `figma_check_design_parity` — Figma コンポーネント仕様とコード実装を比較し、スコア付き差分 + 修正項目を出力（Code Connect の「同期検査」を部分代替）。

### セットアップ（Local Mode・推奨）

前提:
- **Node 18+**（⚠️ このマシンはローカル node が無いので nix `home.packages` 等で追加が必要）。
- Figma デスクトップアプリ（Web 版不可）。
- Figma 個人アクセストークン（PAT・`figd_`。最小スコープ: File content=Read / Variables=Read / Comments=Read&write。90日失効。**リポジトリにコミットしない**）。

```bash
claude mcp add figma-console -s user \
  -e FIGMA_ACCESS_TOKEN=figd_YOUR_TOKEN -e ENABLE_MCP_APPS=true \
  -- npx -y figma-console-mcp@latest
```

その後 Figma デスクトップで **Plugins → Development → Import plugin from manifest** → `~/.figma-console-mcp/plugin/manifest.json` → 「Figma Desktop Bridge」を実行し `Local · ready` を確認する。

> Remote(SSE) モードは設定が楽だが variables が Enterprise 必須なので、本環境では Local Mode を使う。
