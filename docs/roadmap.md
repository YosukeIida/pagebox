# pagebox 次フェーズ実装計画

最終更新: 2026-06-09

---

## 全体方針

以下の4機能を**個別に実装・デプロイ**する。各フィーチャーは専用ブランチ → PR → レビュー → マージ。

| # | 機能 | 状態 | PR |
|---|---|---|---|
| 1 | サブドメイン分離（XSS 対策） | ✅ 完了 | merged |
| 2 | レート制限（Cloudflare Rate Limiting API） | ✅ 完了 | PR #1 merged |
| 3 | OGP + Description 抽出・注入 | ✅ 完了 | PR #2 merged |
| 4 | 動的 OGP 画像生成（Zenn スタイル） | ✅ 完了 | PR #3 merged |

---

## ✅ Feature 1: サブドメイン分離（完了）

`view.pagebox.iodine2.net` で uploaded HTML を配信し、メインアプリ（`pagebox.iodine2.net`）の Cookie/Session と分離。

- `/d/:slug` → 301 redirect to `https://view.pagebox.iodine2.net/:slug`
- Worker が `view.*` ホスト名を検出して直接 R2 から配信

---

## ✅ Feature 2: レート制限（完了）

`POST /api/upload` に Cloudflare Rate Limiting API（`[[ratelimits]]`）で 5回/分/IP の制限を実装。

- `namespace_id = "10001"`、key prefix `pagebox:upload:{ip}`
- KV は OGP 画像キャッシュ用（`OG_CACHE_KV`）として転用済み

---

## ✅ Feature 3: OGP + Description 抽出・注入（完了）

### Context
`view.pagebox.iodine2.net/:slug` の URL を SNS（Slack/Twitter/Discord）に貼ったとき、タイトル・説明文・OGP 画像がプレビュー表示されるようにする。

### ブランチ
`feature/ogp-description`

### 実装手順

**Step 1: description 抽出関数（`src/core/document.ts`）**
```ts
export interface DocumentMeta {
  // 追加
  description: string | null;
}

export function extractDescription(html: string): string | null
  // 優先順位:
  // 1. <meta name="description" content="...">
  // 2. 最初の <p>...</p> テキスト（HTMLタグ除去・200字）
  // 3. null
```

**Step 2: DB スキーマ変更**

`src/db/schema.ts`:
```ts
description: text("description"),  // documents テーブルに追加
```

`src/db/client.ts`: CREATE TABLE に `description TEXT` を追加

`deploy/cloudflare/migrations/0003_ogp.sql`:
```sql
ALTER TABLE documents ADD COLUMN description TEXT;
```

**Step 3: アダプタ更新**
- `src/adapters/repository/drizzle.ts`: `save()` / `rowToMeta()` に description を追加
- `src/adapters/repository/d1.ts`: 同上（生 SQL 版）

**Step 4: usecase 更新（`src/core/usecases/upload-document.ts`）**
```ts
const description = extractDescription(html);
const meta: DocumentMeta = { ..., description };
```

**Step 5: OGP タグ注入（`src/entries/worker.ts` の view サブドメイン処理）**
```ts
function injectOgpTags(html: string, meta: DocumentMeta): string {
  const ogTags = `
<meta property="og:title" content="${escapeAttr(meta.title)}" />
<meta property="og:description" content="${escapeAttr(meta.description ?? '')}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://view.pagebox.iodine2.net/${meta.slug}" />
<meta property="og:image" content="https://pagebox.iodine2.net/d/${meta.slug}/og.png" />
<meta name="twitter:card" content="summary_large_image" />`;
  // <head> がなければ先頭に挿入
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${ogTags}\n</head>`);
  return `<head>${ogTags}\n</head>\n` + html;
}
```

### デプロイ手順
```bash
git checkout -b feature/ogp-description
# 実装
make cf-d1-migrate   # 0003_ogp.sql を D1 に適用
make deploy
gh pr create
```

### 検証
```bash
curl https://view.pagebox.iodine2.net/:slug | grep "og:"
```

---

## ✅ Feature 4: 動的 OGP 画像生成（Zenn スタイル）（完了）

### Context
SNS シェア時に画像プレビューが表示されるよう、`GET /d/:slug/og.png` でタイトル・説明文入りのカード画像を動的生成する。

### ブランチ
`feature/og-image`

### エンドポイント
`GET /d/:slug/og.png` → `image/png`

### 実装

**依存追加（`package.json`）**
```bash
bun add @resvg/resvg-wasm
```

**新規: `src/http/routes/og-image.ts`**
```ts
// 1. D1 から meta を取得
// 2. SVG カードを組み立て（buildSvg）
// 3. resvg-wasm で PNG に変換
// 4. KV（OG_CACHE_KV）に 7日間キャッシュ
// 5. image/png で返す
```

**`src/http/app.ts`（メインドメイン側に登録）**
```ts
app.get("/d/:slug/og.png", ogImageRoute(deps));
```

### SVG デザイン仕様
```
1200 × 630 px
背景:  #f8f6f1（pagebox surface color）
グリッド: 20px、opacity 0.4
タイトル: 64px、最大2行、#1a1a1a、font-weight 900
説明文:   28px、1行、#6b6456、タイトル下 24px
右下:     "pagebox" ロゴ（48px, #e07b39）+ "pagebox.iodine2.net"
```

### デプロイ手順
```bash
git checkout -b feature/og-image
# bun add @resvg/resvg-wasm（Docker 経由）
make deploy
gh pr create
```

### 検証
```bash
curl -o /tmp/test.png https://pagebox.iodine2.net/d/:slug/og.png
open /tmp/test.png
```

---

## ブランチ運用ルール

```
main ← PR 経由でのみマージ（直接 push 禁止）
├── feature/<name>  作業ブランチ
└── fix/<name>      バグ修正ブランチ
```

実装 → `gh pr create` → レビュー承認 → マージ

---

## 変更ファイル一覧（残タスク）

| Feature | 新規 | 変更 |
|---|---|---|
| 3 OGP/Desc | `migrations/0003_ogp.sql` | `document.ts`, `schema.ts`, `client.ts`, `drizzle.ts`, `d1.ts`, `upload-document.ts`, `worker.ts` |
| 4 OG Image | `routes/og-image.ts` | `app.ts`, `package.json`（+ bun.lock） |
