# pagebox 引き継ぎ書

最終更新: 2026-06-09

---

## サービス概要

HTML ファイルをドラッグ＆ドロップするだけで共有 URL を発行するサービス。

| 項目 | 内容 |
|---|---|
| 本番 URL | `https://pagebox.iodine2.net` |
| 閲覧 URL | `https://view.pagebox.iodine2.net/:slug`（XSS 隔離サブドメイン） |
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
│   └── setup-cloudflare-access.mjs  # Cloudflare Access アプリ API 構築スクリプト
├── src/
│   ├── core/                   # ビジネスロジック（外部依存なし）
│   ├── ports/                  # インターフェース定義
│   ├── adapters/               # 具体実装（fs/r2/drizzle/d1/cloudflare-access/dev）
│   ├── db/                     # Drizzle スキーマ・Bun SQLite クライアント
│   ├── http/
│   │   ├── middleware/         # requireAuth / rate-limit
│   │   ├── routes/             # home / api / viewer
│   │   └── web/                # layout.tsx / home.tsx / client.ts / style.css
│   ├── config/container.ts     # 依存の組み立て（Bun 用）
│   └── entries/
│       ├── bun.ts              # Bun サーバー起動
│       └── worker.ts           # Cloudflare Workers エントリ
└── deploy/
    ├── docker/                 # 本番 Docker イメージ（Dockerfile + compose.yaml）
    └── cloudflare/
        ├── wrangler.toml       # Workers / D1 / R2 / KV / カスタムドメイン設定
        └── migrations/
            ├── 0001_init.sql   # documents テーブル
            └── 0002_auth_groups.sql  # users / groups / user_groups
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

---

## Cloudflare リソース一覧

| リソース | 名前/ID |
|---|---|
| Workers スクリプト | `pagebox` |
| D1 データベース | `pagebox`（ID: `a7f4472c-ec7e-4108-b431-e8223a744803`） |
| R2 バケット | `pagebox-blobs` |
| KV Namespace | `OG_CACHE_KV`（ID: `098954f448404ba68b3877a08489613c`、Feature 4 OGP キャッシュ用） |
| カスタムドメイン | `pagebox.iodine2.net`（管理画面）/ `view.pagebox.iodine2.net`（HTML 閲覧） |
| Cloudflare Access | `pagebox`（Allow）/ `pagebox-viewer`（Bypass, `/d` パス） |
| workers.dev | 無効化済み |

---

## 実装済み機能

| 機能 | PR / ブランチ | 内容 |
|---|---|---|
| MVP | main（初期コミット） | HTML アップロード・URL 発行・一覧・削除 |
| 認証 + グループ | main | Cloudflare Access（GitHub/OTP）、ユーザー個人グループ |
| サブドメイン分離 | feature/subdomain-isolation（merged） | `view.pagebox.iodine2.net` で XSS 隔離 |
| レート制限 | PR #1（merged） | `/api/upload` に 5回/分 制限（Cloudflare Rate Limiting API） |

---

## 次のタスク

### 進行中

| ブランチ | 内容 |
|---|---|
| — | Feature 3: OGP + Description 抽出・注入 |
| — | Feature 4: 動的 OGP 画像生成（Zenn スタイル） |

### 優先度 中

| タスク | 内容 |
|---|---|
| **OGP + Description** | アップロード時に description 抽出、配信時に OGP タグ注入 |
| **動的 OGP 画像** | `/d/:slug/og.png` を resvg-wasm で動的生成 |
| **グループ招待** | 現在は個人グループのみ。他ユーザーを招待してドキュメント共有 |
| **ページネーション** | ドキュメントが増えたときの一覧パフォーマンス対策 |

### 優先度 低（Phase3）

| タスク | 内容 |
|---|---|
| **S3 ストレージアダプタ** | `src/adapters/storage/s3.ts` は `throw` のみ |
| **Kubernetes デプロイ** | `deploy/k8s/` は未実装 |
| **テスト追加** | `core/usecases/` のユニットテスト |
