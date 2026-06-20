# デザイン方針

## 参考

- **レイアウト/コピー**: gp-pages（Goodpatch 社内ツール）— ヒーロー + 「ドラッグ&ドロップで完了」の3ステップ + アップロード済み一覧
- **デザインシステム**: ミニマルモダン — 白基調・余白広め・カードベース・アクセント1色・ダークモード対応

## 方向性

- **白基調・広い余白・カード**（角丸・薄い境界）
- **アクセントはオレンジ1色**（`#e07b39`）。ボタン / リンク / ドロップゾーン強調のみに使う。**アクセントは `--accent` 1トークンで後から差し替え可能**な設計
- 本文はサンセリフ、見出しは大きめで視認性重視
- **ダークモード対応**（`prefers-color-scheme` ＋ トグルで `[data-theme]` 上書き、`localStorage` 永続）
- レスポンシブ（中央寄せ・最大幅で読みやすく）

## デザイントークンの正

**値の定義は `src/design/tokens.ts` を参照すること。この md には再掲しない。**

- colors（light / dark）・space・fontSize・fontWeight・radius を TypeScript で定義
- `src/http/web/css.ts` の `renderCss()` がこの値から `:root` と `[data-theme="dark"]` の CSS 変数を生成し、`src/http/web/static/components.css`（コンポーネント定義）と結合して配信する
- コンポーネントの CSS では直接 hex 値を書かず、`var(--token)` 経由で参照する規約

## コンポーネントの実物

`/styleguide`（ログイン後）でトークンのスウォッチと全コンポーネント variant を実 CSS から描画した live リファレンスを閲覧できる。実装の確認はここで行う。

## 画面構成・フロー

詳細は `docs/flow.md` を参照。概要:

- **トップ（`/`）**: ヒーロー → ドロップゾーン → アップロード結果 → アップロード済み一覧
- **閲覧（`/d/:slug`）**: XSS 隔離のためサブドメイン（`view.pagebox.iodine2.net/:slug`）にリダイレクト。OGP タグはリダイレクト先で注入済み
