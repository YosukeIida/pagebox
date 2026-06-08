# sharehtml 調査メモ

ベース実装として検討している OSS の詳細調査。

- **リポジトリ**: https://github.com/jonesphillip/sharehtml
- **調査日**: 2026-06-04

---

## 基本情報

| 項目 | 内容 |
|---|---|
| Stars | 120 |
| Forks | 9 |
| License | Apache 2.0（商用・改変・再配布自由） |
| 言語 | TypeScript |
| 公開日 | 2026-03-07 |
| 最終更新 | 2026-04-09 |

---

## 概要

「CLI でデプロイ → 共有 URL → コメント・リアクション付きで閲覧」というワークフローを実現するセルフホスト型 HTML 共有サービス。

Cloudflare Workers + R2 + Durable Objects で構成されており、自分の Cloudflare アカウントにデプロイして使う。

---

## アーキテクチャ

```
apps/
├── worker/              # Cloudflare Workers（Hono フレームワーク）
│   ├── routes/
│   │   ├── api.ts       # アップロード・ドキュメント管理 API
│   │   └── viewer.ts    # HTML レンダリング・表示
│   ├── durable-objects/
│   │   ├── registry.ts  # ユーザー・ドキュメント管理（SQLite）
│   │   └── document.ts  # コメント・リアクション・WebSocket（リアルタイム）
│   └── frontend/        # ホーム画面（SSR HTML）
└── cli/                 # Bun 製 CLI（deploy / list / share / diff 等）

packages/
└── shared/              # Worker・CLI 共通の型定義
```

### インフラ構成

| コンポーネント | 役割 |
|---|---|
| Cloudflare Workers | HTTP ルーティング・認証・HTML サーブ |
| R2 | HTML ファイル本体の保存 |
| RegistryDO（Durable Objects） | ユーザー・ドキュメントのメタデータ管理（SQLite） |
| DocumentDO（Durable Objects） | コメント・リアクション・リアルタイムプレゼンス（WebSocket） |

### 主要技術

- **フレームワーク**: [Hono](https://hono.dev/)（軽量 Web フレームワーク）
- **ランタイム**: Cloudflare Workers
- **CLI**: Bun
- **認証**: Cloudflare Access（オプション）

---

## 機能一覧

### 実装済み

- HTML / Markdown / コードファイルのデプロイ → URL 発行
- コメント・スレッド返信・絵文字リアクション
- リアルタイムプレゼンス（誰が見ているか）
- ドキュメント一覧・検索・最近見たドキュメント
- 公開範囲設定（リンク共有 / メールで招待）
- Cloudflare Access による認証（メールドメイン制限可）
- Claude Code / Codex 向けスキル（`sharehtml skill install`）
- CLI コマンド: `deploy`, `list`, `open`, `pull`, `diff`, `comments`, `delete`, `share`, `unshare`

### 非対応

- Web UI でのドラッグ&ドロップアップロード（CLI 中心）
- OGP / サムネイル自動生成（Slack プレビューが弱い）
- Google OAuth（Cloudflare Access 経由で代替可能だが設定が必要）

---

## pagebox として使う場合の評価

### 合っている点

- コアフロー（HTML アップロード → URL 発行 → 共有）がそのまま使える
- TypeScript + Hono でコードが読みやすく改変しやすい
- Apache 2.0 でフォーク・改変・再配布が自由
- esa / Notion への埋め込みは `<iframe src="...">` として機能する
- コメント・リアクション機能はそのまま活用できる

### 改変が必要な点

| 項目 | sharehtml 現状 | pagebox で必要なこと |
|---|---|---|
| アップロード UI | CLI のみ | ブラウザ上でドラッグ&ドロップ |
| 認証 | Cloudflare Access | Google OAuth でドメイン制限 |
| OGP | 未対応 | Slack プレビュー用にサムネイル生成 |
| コメント | リアルタイム WebSocket | そのまま使う or シンプル化 |

### インフラの縛り

Cloudflare Workers + R2 + Durable Objects が前提のため、**Vercel + Supabase 構成には移植コストがかかる**。このOSSをベースにするなら Cloudflare で進める方が現実的。

---

## 方針

- このリポジトリを **fork してカスタマイズ** する方向で進める
- まず動かして、UI（ドラッグ&ドロップ）と認証（Google OAuth）を追加する
- OGP / サムネイル生成は後フェーズで検討

## 参考リンク

- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Hono ドキュメント](https://hono.dev/)
- [btbytes/sharehtml（セルフホスト事例）](https://github.com/btbytes/sharehtml)
