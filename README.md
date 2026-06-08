# pagebox

HTML を置いたら、そのまま見える URL になる共有サービス。

Goodpatch 社内ツール **gp-pages** にインスパイアされた HTML ホスティング基盤。

## モチベーション

Claude Code などで作った HTML（資料・デモ・スライド・PoC）を手軽に共有したい。
現状の課題:
- ZIP 添付 → ダウンロード → 解凍 → 開く、の手間
- Vercel にデプロイ → プロジェクトが増えすぎる
- スクショ共有 → インタラクションが伝わらない

## 目標イメージ

- HTML をドラッグ＆ドロップするだけで URL が発行される
- その URL を Slack に貼るだけですぐ開ける
- 公開範囲を柔軟に設定できる
- esa / Notion への埋め込みにも対応

## ドキュメント

- [実装 spec（実行用・確定版）](docs/spec.md)
- [アーキテクチャ方針](docs/architecture.md)
- [技術スタック](docs/tech-stack.md)
- [デザイン方針](docs/design.md)
- [アイデア・要件](docs/ideas.md)
- [sharehtml 調査メモ](docs/sharehtml-investigation.md)
