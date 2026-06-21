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

backfill-description:
	$(NODE_CF) node scripts/backfill-description.mjs

# ── Cloudflare デプロイ ───────────────────────────────────
deploy:
	docker run --rm -v $(PWD):/app -w /app -v pagebox-bun-cache:/root/.bun oven/bun:1 bun run build:worker
	$(NODE_CF) npx --yes wrangler@4 deploy --config deploy/cloudflare/wrangler.toml

cf-dev:
	$(NODE_CF) sh -c "npx --yes wrangler@4 dev --config deploy/cloudflare/wrangler.toml"

.PHONY: dev dev-down typecheck ds-cards cf-d1-create cf-r2-create cf-kv-create cf-d1-migrate backfill-description deploy cf-dev
