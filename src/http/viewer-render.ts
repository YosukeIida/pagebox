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
// オリジンは環境ごとに違うため origins を受け取る（本番と stage で値が変わる）。
//
// og:url は **要求された URL の形** を反映する（`requestedVersion` を渡す）。
// 最新版との比較で推測すると、版固定 URL を共有したのにプレビューが最新版 URL を指してしまう。
//
// og:image は **常に版固定 URL** にする。ここが最重要:
// 画像レスポンスは `max-age=604800` なので、最新版で `/d/:slug/og.png` を出すと
// 版を更新しても URL が変わらず、**CDN / SNS / ブラウザのキャッシュに Worker が到達できない**
// （KV のキーを版別にしても外部キャッシュには効かない）。版ごとに URL を変えれば必ず再取得される。
export function injectOgpTags(
  html: string,
  meta: DocumentMeta,
  version: DocumentVersion,
  origins: Origins,
  requestedVersion?: number,
): string {
  const stripped = html.replace(
    /<meta[^>]+(?:property=["']og:[^"']*["']|name=["']twitter:[^"']*["'])[^>]*\/?>/gi,
    "",
  );
  const ogTags = `<meta property="og:title" content="${escapeAttr(version.title)}" />
<meta property="og:description" content="${escapeAttr(version.description ?? "")}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeAttr(viewUrl(origins, meta.slug, requestedVersion))}" />
<meta property="og:image" content="${escapeAttr(ogImageUrl(origins, meta.slug, version.version))}" />
<meta name="twitter:card" content="summary_large_image" />`;
  if (/<head[^>]*>/i.test(stripped))
    return stripped.replace(/<head[^>]*>/i, (m) => `${m}\n${ogTags}`);
  if (/<\/head>/i.test(stripped))
    return stripped.replace(/<\/head>/i, `${ogTags}\n</head>`);
  return `<head>\n${ogTags}\n</head>\n` + stripped;
}

// OGP タグを注入した HTML レスポンスを組み立てる。
// requestedVersion には「URL で指定された版」を渡す（未指定 = 最新版を要求された）。
export function renderViewerResponse(
  result: { meta: DocumentMeta; version: DocumentVersion; data: Uint8Array },
  origins: Origins,
  requestedVersion?: number,
): Response {
  const html = new TextDecoder().decode(result.data);
  const injected = injectOgpTags(html, result.meta, result.version, origins, requestedVersion);
  return new Response(injected, {
    headers: { "Content-Type": `${result.version.contentType}; charset=utf-8` },
  });
}
