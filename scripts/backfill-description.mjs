#!/usr/bin/env node
/**
 * description が null のドキュメントを D1 から取得し、
 * R2 から HTML を読んで description を再抽出して D1 を更新する。
 *
 * 使い方: make backfill-description
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const DB_ID      = "a7f4472c-ec7e-4108-b431-e8223a744803";
const BUCKET     = "pagebox-blobs";

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN を設定してください");
  process.exit(1);
}

const authHeaders = { "Authorization": `Bearer ${API_TOKEN}` };

async function d1Query(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!data.success) throw new Error(JSON.stringify(data.errors));
  return data.result[0].results;
}

async function r2Get(key) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`,
    { headers: authHeaders }
  );
  if (!res.ok) throw new Error(`R2 ${res.status} ${key}`);
  return await res.text();
}

// src/core/document.ts の extractDescription と同一ロジック
function extractDescription(html) {
  const metaMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (metaMatch) return metaMatch[1].trim().slice(0, 200);

  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let combined = "";
  let m;
  while ((m = pPattern.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    combined = combined ? combined + " " + text : text;
    if (combined.length >= 200) break;
  }
  return combined ? combined.slice(0, 200) : null;
}

async function main() {
  const docs = await d1Query("SELECT slug FROM documents WHERE description IS NULL");
  console.log(`description が null のドキュメント: ${docs.length} 件`);
  if (docs.length === 0) { console.log("更新対象なし。"); return; }

  for (const { slug } of docs) {
    try {
      const html = await r2Get(`${slug}.html`);
      const description = extractDescription(html);
      await d1Query("UPDATE documents SET description = ? WHERE slug = ?", [description, slug]);
      const preview = description ? `"${description.slice(0, 60)}${description.length > 60 ? "…" : ""}"` : "(null)";
      console.log(`✅ ${slug}: ${preview}`);
    } catch (err) {
      console.error(`❌ ${slug}: ${err.message}`);
    }
  }
  console.log("完了。");
}

main().catch(console.error);
