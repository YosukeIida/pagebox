# pagebox 引き継ぎ書

最終更新: 2026-06-08

---

## サービス概要

HTML ファイルをドラッグ＆ドロップするだけで共有 URL を発行するサービス。

| 項目 | 内容 |
|---|---|
| 本番 URL | `https://pagebox.iodine2.net` |
| ランタイム（Bun） | Docker コンテナ or Cloudflare Workers |
| DB | SQLite（ローカル）/ D1（本番） |
| Storage | ローカルファイルシステム / R2（本番） |

---

## リポジトリ構成（主要ファイル）

```
pagebox/
├── Makefile                    # 全操作の入口
├── compose.yaml                # ローカル開発用（oven/bun:1 + ボリュームマウント）
├── .env.cloudflare             # 🔒 gitignore 済み・Cloudflare 認証情報
├── .env.cloudflare.example     # テンプレート
├── src/
│   ├── core/                   # ビジネスロジック（外部依存なし）
│   ├── ports/                  # インターフェース定義
│   ├── adapters/               # 具体実装（fs/s3/r2/drizzle/d1/anonymous）
│   ├── db/                     # Drizzle スキーマ・Bun SQLite クライアント
│   ├── http/                   # Hono ルート・JSX ページ・CSS・クライアント TS
│   ├── config/container.ts     # 依存の組み立て（Bun 用）
│   └── entries/
│       ├── bun.ts              # Bun サーバー起動
│       └── worker.ts           # Cloudflare Workers エントリ
└── deploy/
    ├── docker/                 # 本番 Docker イメージ（Dockerfile + compose.yaml）
    └── cloudflare/
        ├── wrangler.toml       # Workers / D1 / R2 / カスタムドメイン設定
        └── migrations/
            └── 0001_init.sql   # D1 テーブル定義
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
```

### Cloudflare デプロイ

```bash
make deploy       # ビルド（Bun）→ wrangler deploy（Node.js）
```

### Cloudflare 初回セットアップ（済み・参考用）

```bash
make cf-d1-create   # D1 DB 作成 → wrangler.toml に database_id を記入
make cf-r2-create   # R2 バケット作成
make cf-d1-migrate  # スキーマ適用
```

---

## 環境変数

### `.env.cloudflare`（Cloudflare 操作用）

| 変数 | 説明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API トークン（D1 Edit / R2 Edit / Workers Scripts Edit / Account Settings Read） |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID（ダッシュボード URL から確認） |

### サーバー起動時（`compose.yaml` / Docker）

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `3000` | リスンポート |
| `PAGEBOX_DATA_DIR` | `./data` | DB・blob の保存先 |
| `STORAGE_DRIVER` | `fs` | `fs` のみ実装済み（`s3`/`r2` は Phase3） |
| `DB_DRIVER` | `sqlite` | `sqlite` のみ実装済み |

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

## 技術的 MEMO

### wrangler は Node.js で実行する

`bunx wrangler` では非同期処理の互換性問題でデプロイが完了しない。
Makefile では `node:20-slim` + `npx wrangler@4` を使用している。

### Workers Assets のパス設定

`wrangler.toml` の `[assets] directory` は `dist/` を指定している。
`dist/static/style.css` → `/static/style.css` として配信される。
`dist/static/` に設定すると `/style.css` になってしまうので注意。

### Cloudflare API トークンの検証

`/client/v4/user/tokens/verify` はアカウントスコープトークンに非対応。
`/client/v4/accounts/{id}/tokens/verify` を使うこと。

---

## 次のタスク

### 優先度 高

| タスク | 内容 | 必要なもの |
|---|---|---|
| **XSS 対策** | 現在は同一ドメインで raw HTML を配信。悪意ある HTML がアップロードされると XSS リスクあり | サブドメイン分離（`d.pagebox.iodine2.net` 等）または sandbox iframe での表示 |
| **ファイルサイズ・レート制限** | 現在は 10MB 上限のみ。連続アップロードの乱用対策なし | Cloudflare WAF ルールの設定、またはアプリ側でIP/時間ベースのレート制限を実装 |
| **削除の認証** | 現在は誰でも全ドキュメントを削除できる | 簡易パスワード認証、または投稿時にトークンを発行して削除時に検証する仕組み |

### 優先度 中

| タスク | 内容 |
|---|---|
| **テスト追加** | `core/usecases/` のユニットテスト。ポートをモックして各 usecase を検証 |
| **サムネイル生成** | `src/ports/thumbnail.ts` はインターフェースのみ。Cloudflare Browser Rendering API または Puppeteer で実装可能 |
| **OGP / メタタグ** | シェア時のプレビュー表示。アップロード時に `<meta>` を抽出して DocumentMeta に追加 |
| **一覧ページのページネーション** | ドキュメントが増えると一覧が重くなる。`list()` に offset/limit を追加 |

### 優先度 低（Phase3）

| タスク | 内容 |
|---|---|
| **S3 ストレージアダプタ** | `src/adapters/storage/s3.ts` は `throw` のみ。Bun の `S3Client` または AWS SDK で実装 |
| **Kubernetes デプロイ** | `deploy/k8s/` は空。Helm chart または manifest を作成 |
| **Cloudflare Workers エントリの完成** | `src/entries/worker.ts` でアセット配信を Workers Assets に委ねているが、`assets.ts` の Bun 依存コード（`Bun.file`, `Bun.Transpiler`）が束ねられている。Worker 専用の assets ハンドラを作ると clean |

---

## Cloudflare リソース一覧

| リソース | 名前/ID |
|---|---|
| Workers スクリプト | `pagebox` |
| D1 データベース | `pagebox`（ID: `a7f4472c-ec7e-4108-b431-e8223a744803`） |
| R2 バケット | `pagebox-blobs` |
| カスタムドメイン | `pagebox.iodine2.net` |
| workers.dev | 無効化済み |
