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

  // 2. 最初の <p>...</p> テキスト（タグ除去・200字）
  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (pMatch) {
    const text = pMatch[1].replace(/<[^>]+>/g, "").trim();
    if (text) return text.slice(0, 200);
  }

  return null;
}

export function deriveTitle(html: string, fallbackName: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match) {
    const trimmed = match[1].trim();
    if (trimmed) return trimmed;
  }
  return fallbackName.replace(/\.html?$/i, "");
}
