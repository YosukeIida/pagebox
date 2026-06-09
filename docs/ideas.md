# アイデア・要件メモ

## コアコンセプト

「Claude Code で作った HTML を、ドラッグするだけで届ける」

---

## 機能候補

### Must（絶対欲しい）

- [x] HTML ファイルのアップロード → 固有 URL の発行
- [x] 認証（GitHub / One-time PIN — Cloudflare Access で実装）
- [x] Slack でのリンクプレビュー（OGP タグ注入 + 動的 OGP 画像生成）
- [x] アップロードした HTML 一覧ページ

### Should（あると良い）

- [ ] 公開範囲設定（全体 / 特定メンバー / URL 知っている人のみ）
- [ ] サムネイル自動生成（スクリーンショット）
- [ ] esa / Notion への埋め込み対応（`<iframe>` タグ発行）
- [x] ドラッグ＆ドロップ UI
- [x] アップロード者・日時の表示

### Could（余裕があれば）

- [ ] バージョン管理（同一 slug で上書き更新）
- [ ] コメント機能
- [ ] ZIP（複数ファイル）対応
- [ ] CLI での deploy（`pagebox deploy index.html`）
- [ ] Claude Code スキル連携

---

## 懸念・議論ポイント（解決済み含む）

- **認証基盤**: ✅ Cloudflare Access（GitHub / One-time PIN）で実装
- **ストレージ**: ✅ Cloudflare R2 を採用
- **ホスティング**: ✅ Cloudflare Workers を採用
- **費用**: ✅ 小規模利用は無料枠内で運用中
- **サムネイル生成**: △ OGP カード画像（resvg-wasm）は実装済み。フルスクリーンショットは未実装
