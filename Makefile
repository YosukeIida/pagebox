# .env を自動ロード（存在しなくてもエラーにしない）
-include .env.cloudflare
export

BUN   = docker run --rm -v $(PWD):/app -w /app oven/bun:1
# wrangler は Bun と互換性の問題があるため Node.js で実行する
NODE_CF = docker run --rm -v $(PWD):/app -w /app -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID -e WRANGLER_SEND_METRICS=false node:20-slim

# ── ローカル開発 ──────────────────────────────────────────
dev:
	docker compose up

dev-down:
	docker compose down

typecheck:
	$(BUN) bun run typecheck

test:
	$(BUN) bun test

# Claude Design（DesignSync）用のプレビューカード束を design-system/ に生成
ds-cards:
	$(BUN) bun run build:ds-cards

# ── Cloudflare 初回セットアップ ──────────────────────────
cf-access-setup:
	$(NODE_CF) node scripts/setup-cloudflare-access.mjs

cf-d1-create:
	$(NODE_CF) npx --yes wrangler@4 d1 create pagebox

cf-r2-create:
	$(NODE_CF) npx --yes wrangler@4 r2 bucket create pagebox-blobs

cf-secret-aud:
	$(NODE_CF) sh -c "echo '$$ACCESS_AUD' | npx --yes wrangler@4 secret put ACCESS_AUD --config deploy/cloudflare/wrangler.toml"

# ダッシュボード用 secret を設定（ADMIN_EMAILS と CLOUDFLARE_API_TOKEN を .env.cloudflare から読み込み）
cf-secret-dashboard:
	$(NODE_CF) sh -c "echo '$$ADMIN_EMAILS' | npx --yes wrangler@4 secret put ADMIN_EMAILS --config deploy/cloudflare/wrangler.toml"
	$(NODE_CF) sh -c "echo '$$CLOUDFLARE_API_TOKEN' | npx --yes wrangler@4 secret put CLOUDFLARE_API_TOKEN --config deploy/cloudflare/wrangler.toml"

cf-kv-create:
	$(NODE_CF) npx --yes wrangler@4 kv namespace create RATE_LIMIT_KV --config deploy/cloudflare/wrangler.toml

cf-d1-migrate:
	$(NODE_CF) npx --yes wrangler@4 d1 migrations apply pagebox --remote --config deploy/cloudflare/wrangler.toml

# ── Cloudflare デプロイ ───────────────────────────────────
deploy:
	docker run --rm -v $(PWD):/app -w /app -v pagebox-bun-cache:/root/.bun oven/bun:1 bun run build:worker
	$(NODE_CF) npx --yes wrangler@4 deploy --config deploy/cloudflare/wrangler.toml

cf-dev:
	$(NODE_CF) sh -c "npx --yes wrangler@4 dev --config deploy/cloudflare/wrangler.toml"

# ── stage 環境（初回セットアップ）────────────────────────
# 手順は docs/deploy-stage.md を参照。作成 → ID を wrangler.toml に記入 → deploy の順。
cf-stage-d1-create:
	$(NODE_CF) npx --yes wrangler@4 d1 create pagebox-stage

cf-stage-r2-create:
	$(NODE_CF) npx --yes wrangler@4 r2 bucket create pagebox-blobs-stage

cf-stage-kv-create:
	$(NODE_CF) npx --yes wrangler@4 kv namespace create OG_CACHE_KV --env stage --config deploy/cloudflare/wrangler.toml

# stage には ADMIN_EMAILS だけ入れる。CLOUDFLARE_API_TOKEN は入れない
# （本番スコープのトークンを stage に置かない。外部 API 由来のパネルは空欄になる）
cf-stage-secret:
	$(NODE_CF) sh -c "echo '$$ADMIN_EMAILS' | npx --yes wrangler@4 secret put ADMIN_EMAILS --env stage --config deploy/cloudflare/wrangler.toml"

# ── stage 環境（運用）──────────────────────────────────────
# stage 設定が本番から分離されているかを機械的に検証する（問題があれば非ゼロで終了）。
# wrangler の --dry-run は routes を出力しないため、routes の一致・binding の重複・
# TODO_ の残りはこのスクリプトが受け持つ。deploy 経路は必ずこれを通す。
check-stage-config:
	$(BUN) bun run check:stage-config

stage-deploy-dry: check-stage-config
	@echo "── bindings が stage のリソースを指しているか（wrangler --dry-run）──"
	docker run --rm -v $(PWD):/app -w /app -v pagebox-bun-cache:/root/.bun oven/bun:1 bun run build:worker
	$(NODE_CF) npx --yes wrangler@4 deploy --env stage --dry-run --config deploy/cloudflare/wrangler.toml

stage-deploy: check-stage-config
	docker run --rm -v $(PWD):/app -w /app -v pagebox-bun-cache:/root/.bun oven/bun:1 bun run build:worker
	$(NODE_CF) npx --yes wrangler@4 deploy --env stage --config deploy/cloudflare/wrangler.toml

# 共有 DB なので、マイグレーション適用は CI に任せず人が明示的に流す
cf-stage-migrate:
	$(NODE_CF) npx --yes wrangler@4 d1 migrations apply pagebox-stage --remote --env stage --config deploy/cloudflare/wrangler.toml

# stage の D1 を初期化する。PR 間でデータを共有しているため、壊れたらこれで作り直す。
# 注意: R2 の孤児オブジェクトは残る（wrangler に一括削除が無い）。DB から参照されないので無害。
cf-stage-reset:
	$(NODE_CF) npx --yes wrangler@4 d1 execute pagebox-stage --remote --env stage --config deploy/cloudflare/wrangler.toml \
	  --command "DROP TABLE IF EXISTS document_versions; DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS user_groups; DROP TABLE IF EXISTS groups; DROP TABLE IF EXISTS users; DELETE FROM d1_migrations;"
	$(MAKE) cf-stage-migrate

.PHONY: dev dev-down typecheck test ds-cards cf-access-setup cf-d1-create cf-r2-create cf-kv-create cf-secret-aud cf-secret-dashboard cf-d1-migrate deploy cf-dev \
	cf-stage-d1-create cf-stage-r2-create cf-stage-kv-create cf-stage-secret check-stage-config stage-deploy-dry stage-deploy cf-stage-migrate cf-stage-reset
