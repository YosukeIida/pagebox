# 技術スタック

> 検討の結果、当初の暫定案（Next.js + Supabase + Vercel）から **Bun + Hono のコンテナネイティブ構成**へ方針転換した。経緯と全体設計は [architecture.md](architecture.md) を参照。

## 参考実装

| プロジェクト | 技術 | 扱い |
|---|---|---|
| gp-pages（Goodpatch） | 非公開（Vercel + Supabase 推定） | UX・コピーの参考 |
| jonesphillip/sharehtml | Cloudflare Workers + R2 + Durable Objects | コア・slug 生成・viewer URL の参照実装（fork ではなく設計を借用） |

## 現在のスタック（Phase 2 / Cloudflare Workers 本番稼働中）

```
Runtime:    Cloudflare Workers（本番） / Bun（ローカル開発）
Framework:  Hono（API + フロント配信 + HTML 配信を1プロセスで兼任）
Frontend:   Hono JSX(SSR) + 素 TS + プレーン CSS（フレームワーク無し）
ORM:        Drizzle（bun:sqlite / D1 マルチドライバ）
Storage:    Cloudflare R2（本番） / ローカル fs（開発）
DB:         Cloudflare D1（本番） / SQLite（開発）
Auth:       Cloudflare Access（GitHub / One-time PIN）
OGP:        resvg-wasm + @fontsource/noto-sans-jp で動的 PNG 生成
Deploy:     make deploy（bun build → wrangler deploy）
```

ローカル開発は **`docker compose up` だけ**で動く（外部依存ゼロ）。

## Phase 1 MVP スタック（ローカル docker-compose）

```
Runtime:    Bun
Storage:    ローカルファイルシステム（マウント volume）
DB:         SQLite ファイル（bun:sqlite + Drizzle）
Auth:       なし（dev 固定メール）
Deploy:     docker-compose
```

## 当初案からの変更点と理由

| 項目 | 当初案 | 変更後 | 理由 |
|---|---|---|---|
| フロント | Next.js | Hono JSX + 素 TS | この用途には重すぎる。軽量モダン重視 |
| ホスティング | Vercel | docker-compose →（CF →k8s） | Vercel は使わない。全部コンテナ化（将来 k8s Pod） |
| ストレージ | Supabase Storage | fs（MVP）→ S3互換(R2/Garage/SeaweedFS) | 外部依存を避ける。MinIO は 2026/02 に OSS 終了のため不採用 |
| DB | Supabase Postgres | SQLite(MVP)→ D1/Postgres | 軽量・外部依存ゼロ。Drizzle で後から差し替え |
| 認証 | Supabase Auth | なし（MVP）→ Cloudflare Access（Phase2） | まず認証なしで MVP を動かし、Phase2 で Access を採用 |

## フェーズ別の差し替え（詳細）

[architecture.md](architecture.md) のフェーズ別アダプタ・マトリクスを参照。コア（`core/`・`http/`）は不変、`entries/`・`adapters/`・`deploy/`・env だけが変わる。

## コスト

Phase1 は自前コンテナのみ（追加コストなし）。Phase2（現在）は Cloudflare（R2 egress 無料・Workers 有料枠）で稼働中。小規模利用は無料〜低コストで運用可能。
