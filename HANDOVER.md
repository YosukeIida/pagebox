# pagebox 引き継ぎ書

最終更新: 2026-07-26（バージョン管理を実装）

---

## サービス概要

HTML ファイルをドラッグ＆ドロップするだけで共有 URL を発行するサービス。

| 項目 | 内容 |
|---|---|
| 本番 URL | `https://pagebox.iodine2.net` |
| 閲覧 URL | `https://view.pagebox.iodine2.net/:slug`（常に最新版・XSS 隔離サブドメイン） |
| 版固定 URL | `https://view.pagebox.iodine2.net/:slug/v2`（過去バージョンの閲覧用） |
| ランタイム（Bun） | Docker コンテナ or Cloudflare Workers |
| DB | SQLite（ローカル）/ D1（本番） |
| Storage | ローカルファイルシステム / R2（本番） |
| 認証 | Cloudflare Access（GitHub / One-time PIN） |

---

## リポジトリ構成（主要ファイル）

```
pagebox/
├── Makefile                    # 全操作の入口
├── compose.yaml                # ローカル開発用（oven/bun:1 + ボリュームマウント）
├── .env.cloudflare             # 🔒 gitignore 済み・Cloudflare 認証情報
├── .env.cloudflare.example     # テンプレート
├── showcase/
│   └── pagebox-intro.html      # pagebox 紹介ページ（pagebox 自体にアップロード）
├── scripts/
│   ├── setup-cloudflare-access.mjs  # Cloudflare Access アプリ API 構築スクリプト
│   └── check-stage-config.ts        # stage 設定が本番から分離されているかの deploy 前ゲート
├── src/
│   ├── core/                   # ビジネスロジック（外部依存なし）
│   ├── ports/                  # インターフェース定義
│   ├── adapters/               # 具体実装（fs/r2/drizzle/d1/cloudflare-access/dev）
│   ├── db/                     # Drizzle スキーマ・Bun SQLite クライアント
│   ├── http/
│   │   ├── middleware/         # requireAuth / rate-limit
│   │   ├── routes/             # home / api / docs / viewer / dev-viewer / og-image / admin / styleguide
│   │   ├── viewer-render.ts    # view 用レスポンス組み立て（worker と dev-viewer で共有）
│   │   └── web/                # layout.tsx / home.tsx / share.tsx / catalog.tsx / components/ / client.ts
│   ├── config/container.ts     # 依存の組み立て（Bun 用）
│   ├── wasm.d.ts               # *.wasm モジュールの TypeScript 型宣言
│   └── entries/
│       ├── bun.ts              # Bun サーバー起動
│       └── worker.ts           # Cloudflare Workers エントリ
└── deploy/
    ├── docker/                 # 本番 Docker イメージ（Dockerfile + compose.yaml）
    └── cloudflare/
        ├── wrangler.toml       # Workers / D1 / R2 / KV / カスタムドメイン設定
        └── migrations/
            ├── 0001_init.sql   # documents テーブル
            ├── 0002_auth_groups.sql  # users / groups / user_groups
            ├── 0003_ogp.sql    # documents.description カラム追加
            └── 0004_versions.sql     # document_versions + documents.latest_version/updated_at + v1 backfill
```

---

## 開発フロー

### 前提

- Docker が動いていれば OK。Bun・Node.js のローカルインストール不要。
- `.env.cloudflare` を用意する（Cloudflare 操作が必要な場合のみ）:

```bash
cp .env.cloudflare.example .env.cloudflare
# CLOUDFLARE_API_TOKEN と CLOUDFLARE_ACCOUNT_ID を記入
```

### ローカル開発

```bash
make dev          # http://localhost:3000 で起動（ソースをマウント + watch）
make dev-down     # 停止
make typecheck    # 型チェック
make test         # bun test（core/urls.ts と stage 設定ガードの回帰テスト）
```

### Cloudflare デプロイ

```bash
make deploy                  # 本番へ: ビルド（Bun）→ wrangler deploy（Node.js）
make cf-d1-migrate           # 本番 D1 マイグレーション適用（スキーマ変更時のみ）
```

### stage デプロイ

```bash
make check-stage-config      # stage 設定が本番から分離されているかを検証（deploy 経路は必ずこれを通る）
make stage-deploy-dry        # 上記 + wrangler --dry-run
make stage-deploy            # stage へ deploy
make cf-stage-migrate        # stage D1 マイグレーション適用（共有 DB なので手動のみ）
make cf-stage-reset          # stage D1 を初期化して作り直す
```

通常は PR に **`stage` ラベル**を付ければ CI が自動で deploy する。手順の詳細は
[docs/deploy-stage.md](docs/deploy-stage.md)。

### ブランチ運用

```
main ← PR 経由でのみマージ（直接 push 禁止）
└── feature/<name>  または  fix/<name>  で作業
    → 実装完了後に gh pr create → レビュー承認後マージ
```

---

## 環境変数

### `.env.cloudflare`（Cloudflare 操作用）

| 変数 | 説明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API トークン（後述の権限一覧参照） |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID（ダッシュボード URL から確認） |

**必要なトークン権限（Account スコープ）**

D1 Edit / Workers R2 Storage Edit / Workers Scripts Edit / Account Settings Read /
Access: Apps Edit / Access: Policies Edit / Workers KV Storage Edit /
Zone: Workers Routes Edit（iodine2.net）

### サーバー起動時（`compose.yaml` / Docker）

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `3000` | リスンポート |
| `PAGEBOX_DATA_DIR` | `./data` | DB・blob の保存先 |
| `PAGEBOX_DEV_EMAIL` | `dev@localhost` | ローカル開発時の固定ユーザー |
| `STORAGE_DRIVER` | `fs` | `fs` のみ実装済み |
| `DB_DRIVER` | `sqlite` | `sqlite` のみ実装済み |
| `PAGEBOX_APP_ORIGIN` | `http://localhost:$PORT` | 管理画面のオリジン（`src/core/urls.ts` が使う） |
| `PAGEBOX_VIEW_ORIGIN` | `http://localhost:$PORT`（`PAGEBOX_DEV_VIEWER=1` のときは `…/raw`） | 閲覧オリジン。ローカルには view ホストが無いため、開発ビューアが有効なら `/raw` を既定にしてリンクが実際に開けるようにする |
| `PAGEBOX_DEV_VIEWER` | `0` | `1` で開発専用ビューア `/raw/:slug[/vN]` を有効化（`compose.yaml` は `1`）。**⚠️ メインドメインでユーザー HTML を配信するため XSS 隔離を破る。本番では絶対に立てない**（`entries/worker.ts` はこのフラグを渡さないので Cloudflare 経路には出ない） |

### Workers（`wrangler.toml` の vars。環境ごとに値が違う）

| 変数 | 本番 | stage |
|---|---|---|
| `APP_ORIGIN` | `https://pagebox.iodine2.net` | `https://stage.pagebox.iodine2.net` |
| `VIEW_ORIGIN` | `https://view.pagebox.iodine2.net` | `https://view.stage.pagebox.iodine2.net` |
| `ACCESS_AUD` | 本番 Access アプリの aud | stage Access アプリの aud |

**公開 URL をコードに直書きしないこと。** `src/core/urls.ts` の `viewUrl()` / `ogImageUrl()` を通し、
オリジンは上記 vars から注入する。worker のビューア判定も `VIEW_ORIGIN` のホスト名との完全一致で行う
（以前の `startsWith("view.")` は `view.stage.…` を誤って拾うため廃止した）。

---

## アーキテクチャ原則（変更時に守ること）

```
core/ ──→ ports/（インターフェース）
                ↑
           adapters/（具体実装）
                ↑
           config/container.ts（組み立て）
```

- `core/` と `http/` は `adapters/` や `db/` を **import しない**
- 新しいストレージ・DB を追加する場合は `ports/` のインターフェースを実装し、`container.ts` で配線する

---

## データモデル（バージョン管理）

```
documents          … 論理ドキュメント = 共有 URL の単位 + 最新版のスナップショット
                     （title / description / size / original_name / latest_version / updated_at）
document_versions  … 版の実体（append-only）。PK は (slug, version)
                     storage_key に blob の実キー、source_version に「戻す」の由来を持つ
```

- **共有 URL は常に最新版を配信する**（`documents.latest_version`）。過去版は `/:slug/vN` の固定 URL。
- **「この版に戻す」は append-only**。指定した版の中身を複製して新しい最新版として公開するので、過去の版は消えず、戻した操作自体も履歴に残る。
- **バージョンは無制限に保持する**（自動 prune なし）。そのため admin の総サイズは `document_versions` 基準で集計している。
- **blob キーは書き込みごとに独立**: 新規は `{slug}-v{N}-{ランダム8文字}.html`（`core/document.ts` の `versionStorageKey`）。
  ランダム部分を入れているのは**同時更新対策**。同じ slug へ同時に版を追加すると両者が同じ版番号を狙うが、
  版番号は PK で片方しか成功しない。キーを共有していると**後の put が先の put を上書きして
  「DB は勝者のメタデータ・blob は敗者の中身」という食い違い**が起きる。キーを分ければ
  負けた側は参照されない blob を残すだけで済む（`add-document-version.ts` が補償削除して再採番する）。
  バージョン管理導入前の既存オブジェクトは `{slug}.html` のままで、`0004_versions.sql` の backfill が
  それを v1 の `storage_key` として登録する（**R2 のオブジェクト移動は不要**）。
  → 読み出し側は `${slug}.html` を組み立てず、**必ず `document_versions.storage_key` を経由すること**。
- **キーにパス区切りを使わない**のは `adapters/storage/fs.ts` がフラットな名前空間しか許さないため（traversal 対策）。
- **削除は DB を先に、blob を後に**消す。逆順だと blob 削除の途中失敗で「DB にはあるのに配信は 404」の
  壊れたドキュメントができる。DB を先に消せば残るのは参照されない blob だけで実害がない。
- **`document_versions.created_by` に `users(id)` への FK は張っていない。** `documents.uploaded_by` 自体が
  FK 無しで、認証導入前の行に空文字が入り得る（`0002` が `DEFAULT ''` で追加）ため、FK を張ると
  backfill が FK 違反で migration 全体を巻き戻してしまう。

---

## 技術的 MEMO

### wrangler は Node.js で実行する

`bunx wrangler` では非同期処理の互換性問題でデプロイが完了しない。
Makefile では `node:20-slim` + `npx wrangler@4` を使用している。

### Workers Assets のパス設定

`wrangler.toml` の `[assets] directory` は `dist/` を指定。
`dist/static/style.css` → `/static/style.css` として配信される。
`dist/static/` に設定すると `/style.css` になるので注意。

### Cloudflare API トークンの検証

`/client/v4/user/tokens/verify` はアカウントスコープトークンに非対応。
`/client/v4/accounts/{id}/tokens/verify` を使うこと。

### Cloudflare Access のサブパスアプリ

API では既存ルートドメインアプリがある場合サブパスアプリを作れない。
`pagebox-viewer` アプリは Cloudflare ダッシュボードから手動作成した。

### Workers Rate Limiting API

`[[ratelimits]]` を使用。`simple.period` は `10` または `60` 秒のみ有効（`3600` は不可）。
厳密なグローバル一貫性は保証されない。
参考: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### resvg-wasm は静的 import が必須

Cloudflare Workers は `fetch()` 経由の動的 WebAssembly インスタンス化を禁止している（`Wasm code generation disallowed by embedder`）。
`initWasm(fetch(url))` ではなく、`import wasm from "*.wasm"` の静的 import を使い `initWasm(wasm)` と呼ぶこと。
`wrangler.toml` に `[[rules]] type = "CompiledWasm"` の設定が必要。

### OGP 画像のフォントは CDN から実行時フェッチ

resvg に渡すフォント（Noto Sans JP 900/400）は `cdn.jsdelivr.net` から初回リクエスト時にフェッチし、module スコープの Promise でキャッシュする。Worker インスタンスごとに1回だけ実行される。

---

## Cloudflare リソース一覧

### 本番

| リソース | 名前/ID |
|---|---|
| Workers スクリプト | `pagebox` |
| D1 データベース | `pagebox`（ID: `a7f4472c-ec7e-4108-b431-e8223a744803`） |
| R2 バケット | `pagebox-blobs` |
| KV Namespace | `OG_CACHE_KV`（ID: `098954f448404ba68b3877a08489613c`、Feature 4 OGP キャッシュ用） |
| Analytics Engine | `pagebox_events` |
| Rate limit namespace | `10001` |
| カスタムドメイン | `pagebox.iodine2.net`（管理画面）/ `view.pagebox.iodine2.net`（HTML 閲覧） |
| Cloudflare Access | `pagebox`（Allow）/ `pagebox-viewer`（Bypass, `/d` パス） |
| workers.dev | 無効化済み（`workers_dev = false` を wrangler.toml に明示） |

### stage

PR のコードを本番前に検証する環境。**構成・セットアップ手順・運用ルールは
[docs/deploy-stage.md](docs/deploy-stage.md) が正**。

| リソース | 名前/ID |
|---|---|
| Workers スクリプト | `pagebox-stage`（`[env.stage]` から自動命名） |
| D1 データベース | `pagebox-stage`（ID は wrangler.toml に記入） |
| R2 バケット | `pagebox-blobs-stage` |
| KV Namespace | `OG_CACHE_KV`（stage 用 ID） |
| Analytics Engine | `pagebox_events_stage` |
| Rate limit namespace | `10002` |
| カスタムドメイン | `stage.pagebox.iodine2.net` / `view.stage.pagebox.iodine2.net` |
| Cloudflare Access | `pagebox-stage`（Allow）/ `pagebox-stage-viewer`（Bypass） |

- **`stage` ラベルを付けた PR が stage を占有する。** 他 PR が確保中なら CI が落ちる
- **D1 / R2 / KV は PR 間で共有**（PR ごとに DB は作らない）。壊れたら `make cf-stage-reset`
- **マイグレーションは CI では流さない**。`make cf-stage-migrate` を手動実行する
- **`CLOUDFLARE_API_TOKEN` は stage に置かない**ため `/admin` の外部 API 由来パネルは空欄になる

> ⚠️ wrangler の `routes` は環境に**継承される**。`[env.stage]` の routes を消すと
> `deploy --env stage` が本番のカスタムドメインを奪う。これを防ぐため
> `scripts/check-stage-config.ts` が routes の一致・binding の本番重複・`TODO_` の残りを検証し、
> **ローカルの `make stage-deploy` と CI の両方が deploy 前にこのゲートを通る**（fail closed）。

---

## 実装済み機能

| 機能 | PR / ブランチ | 内容 |
|---|---|---|
| MVP | main（初期コミット） | HTML アップロード・URL 発行・一覧・削除 |
| 認証 + グループ | main | Cloudflare Access（GitHub/OTP）、ユーザー個人グループ |
| サブドメイン分離 | feature/subdomain-isolation（merged） | `view.pagebox.iodine2.net` で XSS 隔離 |
| レート制限 | PR #1（merged） | `/api/upload` に 5回/分 制限（Cloudflare Rate Limiting API） |
| OGP + Description | PR #2（merged） | アップロード時に description 抽出、view サブドメインで og:/twitter: タグ注入 |
| 動的 OGP 画像 | PR #3（merged） | `GET /d/:slug/og.png`、resvg-wasm + Noto Sans JP、KV 7日キャッシュ |
| デザイントークン化 | PR #6 / #8（merged） | `src/design/tokens.ts` を正に CSS を生成、`catalog.tsx` を見本の単一の正に |
| **バージョン管理** | feature/document-versions | 同名/同 title 検出 → 新規か更新かを選択、共有 URL は常に最新版、版固定 URL `/:slug/vN`、共有ポップオーバーの版一覧、append-only の「この版に戻す」 |

---

## 次のタスク

### 優先度 中

| タスク | 内容 |
|---|---|
| **グループ招待** | 現在は個人グループのみ。他ユーザーを招待してドキュメント共有 |
| **ページネーション** | ドキュメントが増えたときの一覧パフォーマンス対策 |
| **特定版へのピン留め** | Claude Code artifact の「Always share latest version」トグル OFF 相当。共有 URL が指す版を最新以外に固定する。実装は `documents.pinned_version`（nullable）1列 + 配信側の 1 分岐で足りるが、現状は「常に最新」に固定している |
| **バージョン数の上限** | 現在は無制限。R2 使用量が問題になったら「上限 N 版を超えたら最古を prune」を入れる（admin の総バージョン数・総サイズで監視できる） |
| **版一覧のページング / 非同期削除** | **保持が無制限なので、版が数千件になると O(N) の経路が Workers の制約に当たる**（`GET /docs/:slug/share` と `GET /api/documents/:slug/versions` は全版を返し、削除は全版の blob を直列に消す）。版一覧を cursor pagination にし、削除は Queue 等で再開可能な batch cleanup にする必要がある。PR #10 のレビュー（gpt-5.6-sol）で指摘され、別機能として移送した項目 |
| **部分失敗の reconciler** | R2 put 後に DB が失敗した場合の孤児 blob は `add-document-version.ts` が自分の分を補償削除するが、プロセス落ち等には対応できない。`pending`/`ready`/`deleting` の状態と冪等な cleanup を入れると完全になる（同レビューで移送） |

### 優先度 低（Phase3）

| タスク | 内容 |
|---|---|
| **S3 ストレージアダプタ** | `src/adapters/storage/s3.ts` は `throw` のみ |
| **Kubernetes デプロイ** | `deploy/k8s/` は未実装 |
| **テスト追加** | `core/usecases/` のユニットテスト |
