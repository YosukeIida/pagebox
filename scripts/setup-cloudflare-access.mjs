#!/usr/bin/env node
// Cloudflare Access アプリケーション・ポリシーを API で自動構築するスクリプト
//
// 使い方:
//   node scripts/setup-cloudflare-access.mjs              # 本番
//   node scripts/setup-cloudflare-access.mjs --env stage   # stage
//
// 冪等: 同じホスト名のアプリが既にあれば作成せず AUD だけ表示する。
//
// 注意: 閲覧用ホスト（view.*）には **アプリを作らない**。
// Access アプリが無いホストは保護対象外＝公開になるため、それが期待動作
// （共有 URL は認証なしで開けなければならない）。本番も同じ構成。

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN が必要です");
  process.exit(1);
}

const envIndex = process.argv.indexOf("--env");
const ENV = envIndex >= 0 ? process.argv[envIndex + 1] : "production";

// 環境ごとのアプリ定義。main = true のアプリの AUD を ACCESS_AUD に設定する。
const CONFIGS = {
  production: {
    apps: [
      {
        main: true,
        name: "pagebox",
        domain: "pagebox.iodine2.net",
        policy: { name: "Allow authenticated users", decision: "allow", include: [{ everyone: {} }] },
      },
      {
        name: "pagebox-viewer",
        domain: "pagebox.iodine2.net",
        path: "/d",
        policy: { name: "Public viewer", decision: "bypass", include: [{ everyone: {} }] },
      },
    ],
  },
  stage: {
    apps: [
      {
        main: true,
        name: "pagebox-stage",
        domain: "stage.pagebox.iodine2.net",
        // stage は検証環境なので、本番のように誰でもログインできる形にはせず
        // ADMIN_EMAILS に限定する
        policy: {
          name: "Allow admins",
          decision: "allow",
          include: ADMIN_EMAILS.length > 0
            ? ADMIN_EMAILS.map((email) => ({ email: { email } }))
            : [{ everyone: {} }],
        },
      },
    ],
  },
};

const config = CONFIGS[ENV];
if (!config) {
  console.error(`未知の環境: ${ENV}（production | stage）`);
  process.exit(1);
}
if (ENV === "stage" && ADMIN_EMAILS.length === 0) {
  console.error("stage では ADMIN_EMAILS が必要です（.env.cloudflare に設定してください）");
  process.exit(1);
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) throw new Error(`API error: ${JSON.stringify(data.errors)}`);
  return data.result;
}

// API は path 付きアプリを "domain/path" の形で返すため、比較用に同じ形へ揃える
function fullDomain(domain, path) {
  if (!path) return domain;
  return `${domain}${path.startsWith("/") ? path : `/${path}`}`;
}

const existing = await cf("GET", "/access/apps");

async function ensureApp(spec) {
  const target = fullDomain(spec.domain, spec.path);
  const found = existing.find((a) => a.domain === target);
  if (found) {
    console.log(`✓ ${spec.name} は既に存在します (id: ${found.id})`);
    return found;
  }
  const app = await cf("POST", "/access/apps", {
    name: spec.name,
    domain: spec.domain,
    ...(spec.path ? { path: spec.path } : {}),
    type: "self_hosted",
    session_duration: "24h",
  });
  console.log(`✅ ${spec.name} を作成しました (id: ${app.id}, domain: ${target})`);
  await cf("POST", `/access/apps/${app.id}/policies`, {
    ...spec.policy,
    session_duration: "24h",
    precedence: 1,
  });
  const who = spec.policy.include.map((i) => i.email?.email ?? "everyone").join(", ");
  console.log(`  └─ ${spec.policy.decision} ポリシーを追加しました（${who}）`);
  return app;
}

let mainApp = null;
for (const spec of config.apps) {
  const app = await ensureApp(spec);
  if (spec.main) mainApp = app;
}

console.log("\n========================================");
console.log(`AUD タグ（${ENV} の ACCESS_AUD に設定する値）:`);
console.log(`  ${mainApp.aud}`);
console.log("========================================");

if (ENV === "stage") {
  console.log("\ndeploy/cloudflare/wrangler.toml の [env.stage.vars].ACCESS_AUD に貼ってください。");
  console.log("閲覧用の view.stage.pagebox.iodine2.net には意図的にアプリを作りません（公開）。");
} else {
  console.log("\n.env.cloudflare に以下を追加してください:");
  console.log(`ACCESS_AUD=${mainApp.aud}`);
  console.log("次のコマンドを実行してください:  make cf-secret-aud");
}
