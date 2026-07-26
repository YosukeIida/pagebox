// 論理ドキュメント。title 等は latestVersion 時点のスナップショット。
export interface DocumentMeta {
  slug: string;
  title: string;
  description: string | null;
  originalName: string;
  size: number;
  contentType: string;
  createdAt: Date;
  groupId: string;
  uploadedBy: string;
  latestVersion: number;
  // 最新版の作成時刻。一覧の並び順に使う。
  updatedAt: Date;
}

// 1 回の publish に対応する版。append-only で、削除されるのはドキュメントごと削除するときだけ。
export interface DocumentVersion {
  slug: string;
  version: number;
  title: string;
  description: string | null;
  originalName: string;
  size: number;
  contentType: string;
  // blob の実キー。版ごとに独立。v1 以前の既存オブジェクトは `${slug}.html` のまま入る。
  storageKey: string;
  createdAt: Date;
  createdBy: string;
  // 「この版に戻す」で複製した元の版番号。null は新規アップロード。
  sourceVersion: number | null;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// 新しい版の blob キー。既存 v1（`${slug}.html`）は storageKey 列で吸収するため、
// 読み出し側はこの関数ではなく必ず version.storageKey を使うこと。
// slug は [0-9a-z]{12}（core/ids.ts）なのでハイフンを含まず、旧キーとも衝突しない。
// パス区切りを使わないのは fs アダプタがフラットな名前空間しか許さないため（traversal 対策）。
export function versionStorageKey(slug: string, version: number): string {
  return `${slug}-v${version}.html`;
}

export function isHtmlUpload(name: string, type: string): boolean {
  return /\.html?$/i.test(name) || type.includes("text/html");
}

export function extractDescription(html: string): string | null {
  // 1. <meta name="description" content="...">
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (metaMatch) return metaMatch[1].trim().slice(0, 200);

  // 2. <p> テキストを先頭から連結して 200字まで
  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let combined = "";
  let m: RegExpExecArray | null;
  while ((m = pPattern.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    combined = combined ? combined + " " + text : text;
    if (combined.length >= 200) break;
  }
  return combined ? combined.slice(0, 200) : null;
}

export function deriveTitle(html: string, fallbackName: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match) {
    const trimmed = match[1].trim();
    if (trimmed) return trimmed;
  }
  return fallbackName.replace(/\.html?$/i, "");
}
