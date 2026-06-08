# 技術スタック

> 検討の結果、当初の暫定案（Next.js + Supabase + Vercel）から **Bun + Hono のコンテナネイティブ構成**へ方針転換した。経緯と全体設計は [architecture.md](architecture.md) を参照。

## 参考実装

| プロジェクト | 技術 | 扱い |
|---|---|---|
| gp-pages（Goodpatch） | 非公開（Vercel + Supabase 推定） | UX・コピーの参考 |
| jonesphillip/sharehtml | Cloudflare Workers + R2 + Durable Objects | コア・slug 生成・viewer URL の参照実装（fork ではなく設計を借用） |

## 採用スタック（Phase 1 / MVP）

```
Runtime:    Bun
Framework:  Hono（API + フロント配信 + HTML 配信を1プロセスで兼任）
Frontend:   Hono JSX(SSR) + 素 TS + プレーン CSS（フレームワーク無し）
ORM:        Drizzle（マルチドライバで DB ポータビリティ確保）
Storage:    ローカルファイルシステム（マウント volume）※外部依存ゼロ
DB:         SQLite ファイル（bun:sqlite + Drizzle）※volume 上の1ファイル
Auth:       なし（MVP）。AuthPort だけ定義し anonymous で通す
Deploy:     docker-compose（Phase1）→ Cloudflare(Phase2) → k8s(Phase3)
```

**MVP の外部依存はゼロ**。`docker compose up` だけで動く。

## 当初案からの変更点と理由

| 項目 | 当初案 | 変更後 | 理由 |
|---|---|---|---|
| フロント | Next.js | Hono JSX + 素 TS | この用途には重すぎる。軽量モダン重視 |
| ホスティング | Vercel | docker-compose →（CF →k8s） | Vercel は使わない。全部コンテナ化（将来 k8s Pod） |
| ストレージ | Supabase Storage | fs（MVP）→ S3互換(R2/Garage/SeaweedFS) | 外部依存を避ける。MinIO は 2026/02 に OSS 終了のため不採用 |
| DB | Supabase Postgres | SQLite(MVP)→ D1/Postgres | 軽量・外部依存ゼロ。Drizzle で後から差し替え |
| 認証 | Supabase Auth | なし（MVP）→ 後フェーズで OAuth | まず認証なしで MVP を動かす |

## フェーズ別の差し替え（詳細）

[architecture.md](architecture.md) のフェーズ別アダプタ・マトリクスを参照。コア（`core/`・`http/`）は不変、`entries/`・`adapters/`・`deploy/`・env だけが変わる。

## コスト

Phase1 は自前コンテナのみ（追加コストなし）。Phase2 で Cloudflare（R2 egress 無料・Workers 無料枠）に寄せれば小規模利用は無料枠内の見込み。
