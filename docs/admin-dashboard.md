# pagebox 管理者ダッシュボード設計書

最終更新: 2026-06-19

---

## 概要

HTML アップロード＆URL 共有サービスとして、管理者が以下を把握できるダッシュボードを実装する。

- どのユーザーがよく使っているか
- どのドキュメントがよく閲覧されているか
- どこからアクセスが来ているか（リファラー・国）
- サービスのシステム状態（リクエスト数・エラー率）
- ユーザーのログイン履歴

---

## データソース

### 1. 既存 D1（追加実装不要）

| 情報 | 取得方法 |
|---|---|
| ユーザー一覧・登録日 | `SELECT * FROM users ORDER BY created_at DESC` |
| ユーザーごとのドキュメント数・合計サイズ | `documents` を `uploaded_by` で GROUP BY |
| 直近アップロード一覧 | `documents JOIN users` |
| グループ構成 | `groups`, `user_groups` |

### 2. Cloudflare Analytics Engine（新規 binding 追加が必要）

Workers から `env.ANALYTICS.writeDataPoint()` でカスタムイベントを書き込む時系列 DB。SQL API でクエリ可能。

**書き込むイベント一覧:**

| イベント | blobs | doubles |
|---|---|---|
| ドキュメント閲覧（`view.*` ホスト） | slug, country, referer ドメイン | response_time_ms |
| アップロード | user_email, slug | file_size_bytes |
| OGP 画像生成 | slug | render_time_ms |

**wrangler.toml に追加する設定:**
```toml
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "pagebox_events"
```

**料金:** 現在は無料。将来 Workers Paid ($5/月) が必要になる可能性あり（有効化して使う方針）。

### 3. Cloudflare Access Audit Logs API（無料・追加設定不要）

```
GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/logs/audit
```

- ユーザーのログイン履歴（email, IP, 時刻, 成功/失敗）
- 18 ヶ月分保持
- 全プランで無料

### 4. Cloudflare GraphQL Analytics API（無料・追加設定不要）

インフラ系メトリクスを GraphQL で取得。31 日間保持。

| メトリクス | 用途 |
|---|---|
| Workers リクエスト数・エラー率 | サービス稼働状況 |
| Workers CPU 時間（p50/p99） | パフォーマンス監視 |
| D1 クエリ数・平均レイテンシ | DB 負荷確認 |
| R2 操作数・ストレージ使用量 | ストレージ残量 |

---

## ダッシュボードのパネル構成

```
GET /admin/dashboard（認証必須・ADMIN_EMAILS に含まれる email のみ表示）
│
├── [Panel 1] ユーザーアクティビティ（D1）
│     - ユーザー一覧テーブル（email, 登録日, ドキュメント数, 合計サイズ）
│     - 直近7日でアップロードしたユーザー
│
├── [Panel 2] ドキュメント統計（D1 + Analytics Engine）
│     - 総ドキュメント数・総ストレージ使用量
│     - 閲覧数ランキング（Analytics Engine）
│     - 直近アップロード一覧（slug, title, user, size, date）
│
├── [Panel 3] アクセス分析（Analytics Engine）
│     - 日別 PV グラフ（30日間）
│     - 国別アクセス分布
│     - リファラードメイン ランキング
│
├── [Panel 4] ログイン履歴（Access Audit Logs API）
│     - 直近ログイン一覧（user, IP, 時刻, 成功/失敗）
│     - MAU（月間アクティブユーザー数）
│
└── [Panel 5] システム状態（GraphQL Analytics API）
      - Workers リクエスト数・エラー率（7日間グラフ）
      - D1 クエリ数・レイテンシ
      - R2 ストレージ使用量
```

---

## 実装設計

### 管理者権限

`ADMIN_EMAILS` 環境変数（カンマ区切り）で管理。DB 変更不要。

```toml
# wrangler.toml の [vars] に追加
ADMIN_EMAILS = "admin@example.com,another@example.com"
```

ミドルウェアで `authContext.email` と照合してアクセスを制限。

### AnalyticsPort（K8s 移行を見越した抽象化）

Analytics Engine への書き込みを port/adapter パターンで抽象化し、K8s 移行時に差し替えを容易にする。

```
src/
├── ports/
│   └── analytics.ts          # AnalyticsPort インターフェース
└── adapters/
    └── analytics/
        ├── cloudflare.ts     # Analytics Engine 実装（Workers 用）
        └── noop.ts           # 無効実装（ローカル開発・Bun 用）
```

```typescript
// src/ports/analytics.ts
export interface AnalyticsPort {
  recordView(slug: string, meta: { country?: string; referer?: string; responseTimeMs?: number }): void;
  recordUpload(slug: string, meta: { userEmail: string; fileSizeBytes: number }): void;
}
```

### 新規ルート・ファイル

| ファイル | 役割 |
|---|---|
| `src/http/routes/admin.ts` | `/admin/*` ルート定義 |
| `src/http/web/dashboard.tsx` | ダッシュボード UI（Hono JSX）|
| `src/http/middleware/require-admin.ts` | ADMIN_EMAILS チェックミドルウェア |
| `src/adapters/analytics/cloudflare.ts` | Analytics Engine 実装 |
| `src/adapters/analytics/noop.ts` | ローカル開発用ダミー実装 |
| `src/ports/analytics.ts` | AnalyticsPort インターフェース |

### 追加する API エンドポイント

| エンドポイント | データソース | 用途 |
|---|---|---|
| `GET /api/admin/users` | D1 | ユーザー一覧・集計 |
| `GET /api/admin/documents` | D1 | ドキュメント統計 |
| `GET /api/admin/views` | Analytics Engine SQL API | 閲覧数・アクセス分析 |
| `GET /api/admin/logins` | Access Audit Logs API | ログイン履歴 |
| `GET /api/admin/system` | GraphQL Analytics API | インフラメトリクス |

### 追加する環境変数

| 変数 | 用途 | 設定場所 |
|---|---|---|
| `ADMIN_EMAILS` | 管理者メール（カンマ区切り） | wrangler.toml vars |
| `CLOUDFLARE_API_TOKEN` | Analytics SQL API + GraphQL API + Access Logs | wrangler.toml secret |
| `CLOUDFLARE_ACCOUNT_ID` | 上記 API のアカウント識別子 | wrangler.toml vars |

---

## Cloudflare 無料プランの限度

現在の少人数運用では全て無料プランで動作可能。

| サービス | 無料上限 | 有料化トリガー |
|---|---|---|
| Workers | 100,000 req/日 | トラフィック増加時 → Workers Paid $5/月 |
| Analytics Engine | 100,000 writes/日 | 将来課金開始時 → Workers Paid が必要になる見込み |
| D1 | 読み取り 5M行/日、500MB | ドキュメントが大量になった場合 |
| R2 | 10GB/月 | ファイルが大量になった場合 |
| Access | 50ユーザー無料 | 51人目から +$3/ユーザー/月 |
| Access Audit Logs API | **完全無料**（18ヶ月保持）| — |
| GraphQL Analytics API | **無料**（各サービス料金に含む）| — |

---

## K8s（オンプレ）移行時の互換性

### 自前で収集が必要になるメトリクス

| 種別 | Cloudflare | K8s 代替 |
|---|---|---|
| インフラメトリクス（CPU/メモリ/リクエスト数） | GraphQL Analytics API（自動） | kube-prometheus-stack（Helm 一発でほぼ自動）|
| DB メトリクス | D1 GraphQL メトリクス（自動） | postgres_exporter（Helm あり）|
| ストレージメトリクス | R2 GraphQL メトリクス（自動） | minio/seaweedfs の exporter |
| ユーザーログイン履歴 | Access Audit Logs API（自動） | Authentik の監査ログ API |
| アプリ固有メトリクス（閲覧数等） | Analytics Engine（要実装） | Prometheus カスタムメトリクス / ClickHouse（要実装）|

**インフラ系**: K8s は自前でスタック構築が必要だが、kube-prometheus-stack により多くが自動化される。Cloudflare との差は「セットアップが必要か否か」のみ。

**アプリ固有メトリクス**: どちらの環境でも自前実装が必要。`AnalyticsPort` 抽象化により、K8s 移行時は adapter 差し替えのみで対応。

### 移行時の adapter 対応

| Cloudflare adapter | K8s adapter | 変更範囲 |
|---|---|---|
| `analytics/cloudflare.ts` | `analytics/prometheus.ts` または `analytics/clickhouse.ts` | `container.ts` の配線のみ |

### 推奨 K8s analytics スタック

- **Prometheus + Grafana**: インフラメトリクス（kube-prometheus-stack）
- **ClickHouse**: アプリ固有の長期ログ（閲覧数・アップロード履歴）
  - Analytics Engine の「SQL でクエリできる時系列 DB」に最も近い代替
  - Prometheus から Remote Write も可能

---

## 実装優先順位

| ステップ | 内容 | 依存 |
|---|---|---|
| 1 | `AnalyticsPort` + `noop` / `cloudflare` adapter | なし |
| 2 | wrangler.toml に Analytics Engine binding 追加 | Step 1 |
| 3 | `view.*` ハンドラと upload API にイベント記録追加 | Step 1-2 |
| 4 | `/api/admin/*` エンドポイント実装 | Step 1-3 |
| 5 | `require-admin` ミドルウェア実装 | なし |
| 6 | ダッシュボード UI (`dashboard.tsx`) | Step 4-5 |
| 7 | Cloudflare secrets 設定（API token 等） | Step 6 |
