# アイデア・要件メモ

## コアコンセプト

「Claude Code で作った HTML を、ドラッグするだけで届ける」

---

## 機能候補

### Must（絶対欲しい）

- [ ] HTML ファイルのアップロード → 固有 URL の発行
- [ ] 認証（Google / GitHub OAuth）
- [ ] Slack でのリンクプレビュー（OGP 対応）
- [ ] アップロードした HTML 一覧ページ

### Should（あると良い）

- [ ] 公開範囲設定（全体 / 特定メンバー / URL 知っている人のみ）
- [ ] サムネイル自動生成（スクリーンショット）
- [ ] esa / Notion への埋め込み対応（`<iframe>` タグ発行）
- [ ] ドラッグ＆ドロップ UI
- [ ] アップロード者・日時の表示

### Could（余裕があれば）

- [ ] バージョン管理（同一 slug で上書き更新）
- [ ] コメント機能
- [ ] ZIP（複数ファイル）対応
- [ ] CLI での deploy（`pagebox deploy index.html`）
- [ ] Claude Code スキル連携

---

## 懸念・議論ポイント

- **認証基盤**: Google OAuth か GitHub か、ドメイン制限をどうするか
- **ストレージ**: Supabase Storage / Cloudflare R2 / S3 どれが安いか
- **ホスティング**: Cloudflare Workers か Vercel か
- **費用**: 無料枠でどこまで賄えるか
- **サムネイル生成**: Puppeteer/Playwright を使うか外部 API か
