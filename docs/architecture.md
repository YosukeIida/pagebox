# アーキテクチャ方針

pagebox は **3フェーズのデプロイ進化** を前提に、繋ぎ替え・デプロイ先変更が可能な構成にする。

## デプロイ進化シナリオ

1. **Phase 1（完了）**: docker-compose で小規模に動かす（オンプレ・外部依存ゼロ）
2. **Phase 2（現在の本番）**: Cloudflare Workers + D1 + R2 + Access で稼働中
3. **Phase 3（未実装）**: スケール / 学習目的でオンプレ k8s へ

## なぜポート&アダプタ（ヘキサゴナル）か

ドメイン（core）とインフラ/ランタイム（adapters）を **interface（ports）で分離**することで、各フェーズの差分を「アダプタの差し替え＋デプロイ設定」だけに閉じ込め、**コア（`core/`・`http/`）はどのフェーズでも書き換えない**。

これを支える2本柱：

- **Hono はマルチランタイム**：Bun / Node / Cloudflare Workers で同一ルートコードが動く。入口（`entries/`）アダプタだけが異なる。
- **Drizzle はマルチドライバ**：bun:sqlite / libSQL(Turso) / Cloudflare D1 / PostgreSQL を同一スキーマで切替できる。

## オンプレ ↔ サーバーレスで「本当に分岐する」3か所

| 論点 | コンテナ（オンプレ） | サーバーレス（CF Workers） | pagebox の方針 |
|---|---|---|---|
| リアルタイム/状態共有 | 常駐 WebSocket 可 | Durable Objects 必須（CF専用・移植不可） | **DO を使わない**。コメント等は後付けの optional port |
| 重い/長い処理（サムネ生成＝ヘッドレスブラウザ） | Playwright をそのまま実行 | ブラウザ不可 → CF Browser Rendering 等が必要 | ThumbnailPort で抽象化し差し替え |
| ファイルシステム | volume に直接書ける | fs なし → R2 必須 | StoragePort で抽象化（fs / s3 / r2） |

→ これらを抽象化しておけば、オンプレ↔サーバーレスの切替は再設計不要。

## ストレージ事情（2026 時点）

- **MinIO は 2026/02 に OSS 開発終了・archive**。新規採用しない。
- S3 互換が必要なフェーズでは **Cloudflare R2 / Garage / SeaweedFS** を使う（いずれも S3 API）。
- **MVP はストレージも DB も外部サービス不要**（ローカルファイルシステム + SQLite ファイル）で完結させ、ストレージ/DB の本決定は後フェーズに倒す。

## ポートと、フェーズ別アダプタ・マトリクス

| ポート | Phase1 docker-compose | Phase2 Cloudflare | Phase3 k8s |
|---|---|---|---|
| HTTP 入口 | `entries/bun.ts`（Bun.serve） | `entries/worker.ts`（export default app） | `entries/bun.ts` |
| Storage | `adapters/storage/fs` | `adapters/storage/r2`（R2 binding） | `adapters/storage/s3`（Garage/SeaweedFS） |
| DB | Drizzle + bun:sqlite | Drizzle + D1 | Drizzle + Postgres / libSQL |
| Thumbnail（後） | `adapters/thumbnail/playwright` | `adapters/thumbnail/cf-browser` | `adapters/thumbnail/playwright` |
| Realtime（後） | コンテナ内 WebSocket | （DO は使わない → 外部 or polling） | WS / Redis pub-sub |
| Auth | なし（dev 固定メール） | Cloudflare Access（GitHub/OTP）✅ | OAuth ライブラリ or Access |

**コア（`core/`・`http/`）はどのフェーズでも不変。** 変わるのは `entries/`・`adapters/`・`deploy/`・env のみ。

## 不変条件（依存方向）

- `core/`・`http/` は `adapters/`・`db/` を **import しない**。依存は `ports/` の interface のみ。
- 具体アダプタの配線は `config/container.ts`（composition root）に集約し、env で選択：
  - `STORAGE_DRIVER = fs | s3 | r2`
  - `DB_DRIVER = sqlite | libsql | d1 | postgres`
  - `THUMBNAIL_DRIVER = none | playwright | cf-browser`

実装の詳細は [spec.md](spec.md) を参照。
