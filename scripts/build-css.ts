// Workers ビルド経路用: tokens + components.css から最終 CSS を生成し
// dist/static/style.css に書き出す。serveStyle（Bun 経路）と同じ renderCss() を
// 共有することで、ローカルと本番で配信される CSS を一致させる。
import { join } from "node:path";
import { renderCss } from "../src/http/web/css";

const componentsPath = join(import.meta.dir, "../src/http/web/static/components.css");
const outPath = join(import.meta.dir, "../dist/static/style.css");

const components = await Bun.file(componentsPath).text();
await Bun.write(outPath, renderCss(components));
console.log(`[build-css] wrote ${outPath}`);
