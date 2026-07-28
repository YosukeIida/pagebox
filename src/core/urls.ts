// 公開 URL の組み立てを一箇所に集約する。
//
// 以前は `https://view.pagebox.iodine2.net/...` が home / api / viewer / worker / dashboard に
// 直書きされていたため、本番以外の環境（stage）で動かすと本番 URL を吐いてしまっていた。
// origin は呼び出し側から渡す（core が env を直接読まない = ports/adapters の境界を保つ）。
//
// 副作用なし・依存ゼロの純粋な関数モジュール。

export interface Origins {
  // 管理画面のオリジン。例 https://pagebox.iodine2.net
  app: string;
  // XSS 隔離済みビューアのオリジン。例 https://view.pagebox.iodine2.net
  view: string;
}

// 共有 URL。
export function viewUrl(o: Origins, slug: string): string {
  return `${trimSlash(o.view)}/${slug}`;
}

// 動的 OGP 画像の URL（管理画面側で生成するため app オリジン）。
export function ogImageUrl(o: Origins, slug: string): string {
  return `${trimSlash(o.app)}/d/${slug}/og.png`;
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

function trimSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}
