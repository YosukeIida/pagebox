#!/usr/bin/env node
// Cloudflare Access アプリケーション・ポリシーを API で自動構築するスクリプト
// 使い方: node scripts/setup-cloudflare-access.mjs

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DOMAIN = "pagebox.iodine2.net";

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN が必要です");
  process.exit(1);
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`API error: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

// 既存アプリ一覧を取得（domain + path で重複チェック）
const existing = await cf("GET", "/access/apps");
const findApp = (domain, path) =>
  existing.find((a) => a.domain === domain && (a.path ?? "") === (path ?? ""));

async function ensureApp(name, appBody, policyBody) {
  const found = findApp(appBody.domain, appBody.path);
  if (found) {
    console.log(`✓ ${name} は既に存在します (id: ${found.id})`);
    return found;
  }
  const app = await cf("POST", "/access/apps", appBody);
  console.log(`✅ ${name} を作成しました (id: ${app.id})`);
  await cf("POST", `/access/apps/${app.id}/policies`, policyBody);
  console.log(`  └─ ${policyBody.decision} ポリシーを追加しました`);
  return app;
}

// ── アプリ 1: メイン（認証必須） ──────────────────────────
const mainApp = await ensureApp("pagebox", {
  name: "pagebox",
  domain: DOMAIN,
  type: "self_hosted",
  session_duration: "24h",
}, {
  name: "Allow authenticated users",
  decision: "allow",
  include: [{ everyone: {} }],
  session_duration: "24h",
  precedence: 1,
});

// ── アプリ 2: ビューア（/d/* 公開） ───────────────────────
const viewerApp = await ensureApp("pagebox-viewer", {
  name: "pagebox-viewer",
  domain: DOMAIN,
  path: "/d",
  type: "self_hosted",
  session_duration: "24h",
}, {
  name: "Public viewer",
  decision: "bypass",
  include: [{ everyone: {} }],
  session_duration: "24h",
  precedence: 1,
});

// ── AUD タグを出力 ────────────────────────────────────────
console.log("\n========================================");
console.log("AUD タグ（ACCESS_AUD に設定する値）:");
console.log(`  pagebox (メイン): ${mainApp.aud}`);
console.log("========================================");
console.log("\n.env.cloudflare に以下を追加してください:");
console.log(`ACCESS_AUD=${mainApp.aud}`);
console.log("\n次のコマンドを実行してください:");
console.log("  make cf-secret-aud");
