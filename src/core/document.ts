export interface DocumentMeta {
  slug: string;
  title: string;
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

export function deriveTitle(html: string, fallbackName: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match) {
    const trimmed = match[1].trim();
    if (trimmed) return trimmed;
  }
  return fallbackName.replace(/\.html?$/i, "");
}
