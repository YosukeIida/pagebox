# デザイン方針

## 参考

- **レイアウト/コピー**: gp-pages（Goodpatch 社内ツール）— ヒーロー + 「ドラッグ&ドロップで完了」の3ステップ + アップロード済み一覧
- **デザインシステム**: [nutmeg blog](https://blog.nutmeg.cloud/) — 白基調・余白広め・カードベース・アクセント1色・ダークモード対応のミニマルモダン

## 方向性

- **白基調・広い余白・カード**（角丸・薄い境界）
- **アクセントは黄橙色1色**（nutmeg 寄せ）。ボタン / リンク / ドロップゾーン強調のみに使う
- 本文はサンセリフ、見出しは大きめで視認性重視
- **ダークモード対応**（`prefers-color-scheme` ＋ トグルで `[data-theme]` 上書き、`localStorage` 永続）
- レスポンシブ（中央寄せ・最大幅で読みやすく）

## デザイントークン（CSS 変数）

`src/http/web/static/style.css` の `:root` に定義。**アクセントは1トークンで後から差し替え可能**。

```css
:root{
  --accent:#f59e0b;            /* 黄橙（nutmeg 寄せ） */
  --bg:#ffffff; --surface:#f7f7f8; --fg:#1a1a1a; --muted:#6b7280;
  --border:#e5e7eb; --radius:14px; --maxw:880px;
  --space:clamp(16px,4vw,40px);
}
:root[data-theme="dark"]{
  --bg:#0d0f12; --surface:#16191e; --fg:#f3f4f6; --muted:#9ca3af; --border:#262b33;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){ /* dark と同値 */ }
}
```

## 画面構成（MVP）

トップ（`/`）1画面に集約：

1. **ヒーロー** — 見出し「HTML を、ドラッグするだけで共有」＋サブコピー
2. **ドロップゾーン** — ドラッグ&ドロップ、またはクリックでファイル選択（`.html,.htm`）
3. **アップロード結果** — 発行 URL を表示、コピーボタン
4. **一覧** — アップロード済み HTML をカード表示（タイトル / URL / 作成日時 / サイズ / 開く・コピー・削除）

閲覧画面（`/d/:slug`）は HTML をそのまま raw 配信（iframe 埋め込み可）。
