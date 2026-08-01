// 公開 URL の組み立てを一箇所に集約する。
//
// 以前は `https://view.pagebox.iodine2.net/...` が home / api / viewer / worker / dashboard に
// 直書きされていたため、本番以外の環境（stage）で動かすと本番 URL を吐いてしまっていた。
// origin は呼び出し側から渡す（core が env を直接読まない = ports/adapters の境界を保つ）。
//
// バージョン付き URL も view / OGP / リダイレクト / UI の複数経路で必要になるため、
// 文字列を各所で組み立てるとドリフトする。ここに集約する。
//
// 副作用なし・依存ゼロの純粋な関数モジュール。

export interface Origins {
  // 管理画面のオリジン。例 https://pagebox.iodine2.net
  app: string;
  // XSS 隔離済みビューアのオリジン。例 https://view.pagebox.iodine2.net
  view: string;
}

// 共有 URL。version を省略すると常に最新版を配信する URL になる。
export function viewUrl(o: Origins, slug: string, version?: number): string {
  const base = `${trimSlash(o.view)}/${slug}`;
  return version === undefined ? base : `${base}/v${version}`;
}

// 動的 OGP 画像の URL（管理画面側で生成するため app オリジン）。
// version を省略すると最新版のカードを指す。
export function ogImageUrl(o: Origins, slug: string, version?: number): string {
  const base = trimSlash(o.app);
  return version === undefined
    ? `${base}/d/${slug}/og.png`
    : `${base}/d/${slug}/v${version}/og.png`;
}

// view オリジンのホスト名。worker がリクエストのホストを判定するのに使う。
// 解釈できない値のときは空文字を返し、判定が誤って通らないようにする。
export function viewHostname(o: Origins): string {
  try {
    return new URL(o.view).hostname;
  } catch {
    return "";
  }
}

// view オリジンのパスを解釈する。
// `/abc123` → { slug: "abc123" }、`/abc123/v2` → { slug: "abc123", version: 2 }。
// 解釈できないパス（空・不正なバージョン・余分なセグメント）は null を返す。
export function parseViewPath(pathname: string): { slug: string; version?: number } | null {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0 || segments.length > 2) return null;

  const [slug, versionSegment] = segments;
  if (versionSegment === undefined) return { slug };

  const match = /^v(\d+)$/.exec(versionSegment);
  if (!match) return null;
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version) || version < 1) return null;
  return { slug, version };
}

function trimSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}
