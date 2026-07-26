// view オリジンで返すレスポンスの組み立て。
// Workers（entries/worker.ts）と、ローカル検証用の開発ルート（routes/dev-viewer.ts）が共有する。
// adapters / db に依存しない純粋な変換なのでアーキテクチャ境界を跨がない。
import type { DocumentMeta, DocumentVersion } from "../core/document";
import type { Origins } from "../core/urls";
import { ogImageUrl, viewUrl } from "../core/urls";

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 既存の og: / twitter: タグを除去してから Pagebox のタグを先頭に注入する。
// タイトル・説明文は「いま閲覧している版」のものを使う。
// og:url / og:image は、最新版なら共有 URL（/{slug}）、過去版なら固定 URL（/{slug}/v{n}）を指す。
// オリジンは環境ごとに違うため origins を受け取る（本番と stage で値が変わる）。
export function injectOgpTags(
  html: string,
  meta: DocumentMeta,
  version: DocumentVersion,
  origins: Origins,
): string {
  const pinned = version.version === meta.latestVersion ? undefined : version.version;
  const stripped = html.replace(
    /<meta[^>]+(?:property=["']og:[^"']*["']|name=["']twitter:[^"']*["'])[^>]*\/?>/gi,
    "",
  );
  const ogTags = `<meta property="og:title" content="${escapeAttr(version.title)}" />
<meta property="og:description" content="${escapeAttr(version.description ?? "")}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeAttr(viewUrl(origins, meta.slug, pinned))}" />
<meta property="og:image" content="${escapeAttr(ogImageUrl(origins, meta.slug, pinned))}" />
<meta name="twitter:card" content="summary_large_image" />`;
  if (/<head[^>]*>/i.test(stripped))
    return stripped.replace(/<head[^>]*>/i, (m) => `${m}\n${ogTags}`);
  if (/<\/head>/i.test(stripped))
    return stripped.replace(/<\/head>/i, `${ogTags}\n</head>`);
  return `<head>\n${ogTags}\n</head>\n` + stripped;
}

// OGP タグを注入した HTML レスポンスを組み立てる。
export function renderViewerResponse(
  result: { meta: DocumentMeta; version: DocumentVersion; data: Uint8Array },
  origins: Origins,
): Response {
  const html = new TextDecoder().decode(result.data);
  const injected = injectOgpTags(html, result.meta, result.version, origins);
  return new Response(injected, {
    headers: { "Content-Type": `${result.version.contentType}; charset=utf-8` },
  });
}
