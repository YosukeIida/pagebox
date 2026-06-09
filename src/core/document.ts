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
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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
