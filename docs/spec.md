# pagebox 実装 spec（実行用・確定版）

> このドキュメントは **上から順に実装するだけ** で MVP が完成するよう、file/function 単位まで確定させた実装仕様。実行は Sonnet 4.6 を想定し、不確実な箇所を残さないことを目的とする。
> アーキテクチャの背景は [architecture.md](architecture.md)、デザインは [design.md](design.md) を参照。

## 確定した決定事項

| 項目 | 決定 |
|---|---|
| アップロード単位 | **単一 HTML ファイルのみ**（自己完結 .html。アセット/ZIP は将来） |
| slug 形式 | **sharehtml 踏襲**：12文字・英数小文字 `0-9a-z` の自前 nanoid |
| 閲覧 URL | **`/d/:slug`**（sharehtml 互換） |
| デザイン | **nutmeg 寄せ**：白基調・余白広め・カード・**黄橙アクセント**・ダークモード対応 |
| フロント | **Hono JSX(SSR) + 素 TS + プレーン CSS**（フレームワーク無し・最軽量） |
| タイトル | `<title>` タグ優先 → 無ければファイル名（拡張子除去） |
| バージョン管理 | 無し（毎回新規 slug） |
| 最大サイズ | 10MB |
| ローカルポート | 3000 |
| 認証 | 無し（一覧・削除は全公開）。`AuthPort` だけ定義し anonymous で通す |
| 閲覧配信 | MVP は同一ドメインで raw 配信、iframe 埋め込み許可（X-Frame-Options を付けない） |

## 技術スタック / 依存

- Runtime: **Bun**
- Framework: **Hono** + Hono JSX（`hono/jsx`）
- ORM: **Drizzle**（`drizzle-orm/bun-sqlite` + `bun:sqlite`）
- ビルド: 無し（Bun が TS を直接実行。クライアント TS は起動時に `Bun.Transpiler` で JS 化して配信）

```
dependencies:    hono, drizzle-orm
devDependencies: drizzle-kit, @types/bun, typescript
```

## ディレクトリ構成

```
pagebox/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .gitignore
├── .dockerignore
├── src/
│   ├── core/
│   │   ├── ids.ts
│   │   ├── document.ts
│   │   ├── errors.ts
│   │   └── usecases/
│   │       ├── upload-document.ts
│   │       ├── get-document.ts
│   │       ├── list-documents.ts
│   │       └── delete-document.ts
│   ├── ports/
│   │   ├── storage.ts
│   │   ├── repository.ts
│   │   ├── auth.ts
│   │   └── thumbnail.ts        # 枠のみ
│   ├── adapters/
│   │   ├── storage/
│   │   │   ├── fs.ts
│   │   │   ├── s3.ts           # 枠のみ（throw 未実装）
│   │   │   └── r2.ts           # 枠のみ（throw 未実装）
│   │   ├── repository/
│   │   │   └── drizzle.ts
│   │   └── auth/
│   │       └── anonymous.ts
│   ├── db/
│   │   ├── schema.ts
│   │   └── client.ts
│   ├── http/
│   │   ├── app.ts
│   │   ├── routes/
│   │   │   ├── home.ts
│   │   │   ├── api.ts
│   │   │   └── viewer.ts
│   │   └── web/
│   │       ├── layout.tsx
│   │       ├── home.tsx
│   │       ├── client.ts
│   │       ├── assets.ts
│   │       └── static/
│   │           └── style.css
│   ├── config/
│   │   └── container.ts
│   └── entries/
│       ├── bun.ts
│       └── worker.ts           # 枠のみ（Phase2 TODO）
├── deploy/
│   ├── docker/
│   │   ├── Dockerfile
│   │   └── compose.yaml
│   ├── cloudflare/
│   │   └── wrangler.toml       # 枠のみ（Phase2）
│   └── k8s/                    # Phase3（今回は README のみ）
└── docs/
```

## 不変条件（依存方向）

- `core/`・`http/` は `adapters/`・`db/` を **import しない**。依存は `ports/` の interface のみ。
- 具体アダプタの配線は `config/container.ts`（composition root）に集約。env で選択：
  - `STORAGE_DRIVER = fs | s3 | r2`（MVP: fs のみ実装、他は throw）
  - `DB_DRIVER = sqlite | libsql | d1 | postgres`（MVP: sqlite のみ）

---

## ファイル別 spec

### src/core/ids.ts
```ts
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
export function nanoid(size = 12): string  // crypto.getRandomValues で生成（sharehtml 同等・ランタイム非依存）
export function generateSlug(): string      // return nanoid(12)
```

### src/core/document.ts
```ts
export interface DocumentMeta {
  slug: string;
  title: string;
  originalName: string;
  size: number;          // bytes
  contentType: string;   // 例 "text/html"
  createdAt: Date;
}
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export function isHtmlUpload(name: string, type: string): boolean
  // name が .html/.htm で終わる、または type に "text/html" を含む
export function deriveTitle(html: string, fallbackName: string): string
  // /<title[^>]*>([\s\S]*?)<\/title>/i にマッチ→trim。空なら fallbackName から末尾 .html?/.htm を除去
```

### src/core/errors.ts
```ts
export class ValidationError extends Error {}   // 400 にマップ
```

### src/ports/storage.ts
```ts
export interface StoragePort {
  put(key: string, data: Uint8Array, meta?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
// contentType は DocumentMeta 側で保持。fs は meta を無視、S3/R2 はオブジェクトの content-type に使う。
```

### src/ports/repository.ts
```ts
import type { DocumentMeta } from "../core/document";
export interface DocumentRepository {
  save(doc: DocumentMeta): Promise<void>;
  findBySlug(slug: string): Promise<DocumentMeta | null>;
  list(): Promise<DocumentMeta[]>;   // createdAt 降順
  delete(slug: string): Promise<void>;
}
```

### src/ports/auth.ts
```ts
export interface AuthUser { email: string | null; anonymous: boolean; }
export interface AuthPort { authenticate(req: Request): Promise<AuthUser>; }
```

### src/ports/thumbnail.ts（枠）
```ts
export interface ThumbnailPort { generate(html: string): Promise<Uint8Array | null>; }
```

### src/core/usecases/upload-document.ts
```ts
export interface UploadInput { fileName: string; contentType: string; bytes: Uint8Array; }
export interface UploadDeps { storage: StoragePort; repo: DocumentRepository; }
export async function uploadDocument(deps: UploadDeps, input: UploadInput): Promise<DocumentMeta>
```
処理: ① `isHtmlUpload` でなければ `ValidationError("HTML ファイルのみ対応しています")`。② `bytes.byteLength > MAX_UPLOAD_BYTES` なら `ValidationError`。③ `new TextDecoder().decode(bytes)` で html 文字列化し `deriveTitle`。④ slug 採番：`generateSlug()` を `repo.findBySlug` が null になるまで（最大5回）。⑤ key = `` `${slug}.html` ``。⑥ `storage.put(key, bytes, { contentType: "text/html" })`。⑦ meta = `{ slug, title, originalName: fileName, size: bytes.byteLength, contentType: "text/html", createdAt: new Date() }`。⑧ `repo.save(meta)`。⑨ return meta。

### src/core/usecases/get-document.ts
```ts
export async function getDocument(
  deps: { storage: StoragePort; repo: DocumentRepository },
  slug: string,
): Promise<{ meta: DocumentMeta; data: Uint8Array } | null>
```
`repo.findBySlug` → null なら null。`storage.get(`` `${slug}.html` ``)` → null なら null。両方あれば `{ meta, data }`。

### src/core/usecases/list-documents.ts
```ts
export async function listDocuments(deps: { repo: DocumentRepository }): Promise<DocumentMeta[]>
  // return deps.repo.list()
```

### src/core/usecases/delete-document.ts
```ts
export async function deleteDocument(
  deps: { storage: StoragePort; repo: DocumentRepository },
  slug: string,
): Promise<boolean>
```
`findBySlug` が null なら false。`storage.delete(`` `${slug}.html` ``)` → `repo.delete(slug)` → true。

### src/db/schema.ts
```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const documents = sqliteTable("documents", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
```

### src/db/client.ts
```ts
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";
export type DB = ReturnType<typeof createDb>;
export function createDb(path: string) {
  const sqlite = new Database(path, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  // MVP ブートストラップ（drizzle-kit 生成に依存しない確定的初期化）
  sqlite.exec(`CREATE TABLE IF NOT EXISTS documents (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`);
  return drizzle(sqlite, { schema });
}
```

### src/adapters/repository/drizzle.ts
```ts
import { eq, desc } from "drizzle-orm";
export function createDrizzleRepository(db: DB): DocumentRepository
```
- `save`: `db.insert(documents).values(meta)`（createdAt は Date のまま、timestamp_ms モードが変換）
- `findBySlug`: `db.select().from(documents).where(eq(documents.slug, slug)).get()` → 行を `DocumentMeta` にマップ（無ければ null）
- `list`: `db.select().from(documents).orderBy(desc(documents.createdAt)).all()` → map
- `delete`: `db.delete(documents).where(eq(documents.slug, slug))`
- 行↔DocumentMeta マッパ `rowToMeta(row)` を内部に持つ（original_name→originalName 等）

### src/adapters/storage/fs.ts
```ts
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
export function createFsStorage(baseDir: string): StoragePort
```
- factory 内で `mkdirSync(baseDir, { recursive: true })`
- `put`: `await Bun.write(join(baseDir, key), data)`（meta は無視）
- `get`: `const f = Bun.file(join(baseDir, key)); if (!(await f.exists())) return null; return new Uint8Array(await f.arrayBuffer());`
- `delete`: `await unlink(join(baseDir, key)).catch(() => {})`
- key にパス区切りが無い前提（`` `${slug}.html` ``）。念のため `key.includes("/")` を弾く。

### src/adapters/storage/s3.ts / r2.ts（枠）
```ts
export function createS3Storage(/* opts */): StoragePort { throw new Error("s3 storage: Phase3 で実装（R2/Garage/SeaweedFS 共通の S3 互換）"); }
// r2.ts も同様に Phase2 TODO
```

### src/adapters/auth/anonymous.ts
```ts
export function createAnonymousAuth(): AuthPort {
  return { async authenticate() { return { email: null, anonymous: true }; } };
}
```

### src/config/container.ts（composition root）
```ts
export interface AppConfig {
  port: number; dataDir: string; dbPath: string; storageDir: string;
  storageDriver: string; dbDriver: string;
}
export function loadConfig(env: Record<string, string | undefined>): AppConfig
export function createContainer(config: AppConfig): { app: Hono; config: AppConfig }
```
`loadConfig` の既定値:
```
PORT                 → 3000
PAGEBOX_DATA_DIR     → "./data"
PAGEBOX_DB_PATH      → `${dataDir}/pagebox.db`
PAGEBOX_STORAGE_DIR  → `${dataDir}/blobs`
STORAGE_DRIVER       → "fs"
DB_DRIVER            → "sqlite"
```
`createContainer`: `db = createDb(config.dbPath)` → `repo = createDrizzleRepository(db)` → storage は `switch(storageDriver){ case "fs": createFsStorage(storageDir); default: throw }` → `auth = createAnonymousAuth()` → `app = createApp({ storage, repo, auth })`。

### src/http/app.ts
```ts
export interface AppDeps { storage: StoragePort; repo: DocumentRepository; auth: AuthPort; }
export function createApp(deps: AppDeps): Hono
```
ルート登録:
- `app.get("/static/style.css", ...)` → `serveStyle()`（assets.ts）
- `app.get("/static/app.js", ...)` → `serveClientJs()`（assets.ts）
- `app.route("/", homeRoutes(deps))`
- `app.route("/api", apiRoutes(deps))`
- `app.route("/d", viewerRoutes(deps))`
- 404 ハンドラ（簡易）

### src/http/web/assets.ts
```ts
export async function serveStyle(c): Response
  // Bun.file(<style.css の絶対パス>) を text/css で返す（import.meta.dir 基準）
export async function serveClientJs(c): Response
  // const ts = await Bun.file(<client.ts 絶対パス>).text();
  // const js = new Bun.Transpiler({ loader: "ts" }).transformSync(ts);
  // application/javascript で返す（起動時 or 初回にメモ化）
```
パスは `import.meta.dir` 基準で解決（`join(import.meta.dir, "static/style.css")`, `join(import.meta.dir, "client.ts")`）。

### src/http/web/layout.tsx
```tsx
export function Layout(props: { title: string; children: any }): JSX.Element
```
`<html lang="ja" data-theme>` … `<head>` に `<meta viewport>`・`<title>`・`<link rel="stylesheet" href="/static/style.css">`、`<body>` に `props.children` と末尾 `<script type="module" src="/static/app.js"></script>`。

### src/http/web/home.tsx
```tsx
export function HomePage(props: { documents: DocumentMeta[] }): JSX.Element
```
構成（nutmeg 寄せ）:
- ヒーロー: 見出し「HTML を、ドラッグするだけで共有」＋サブコピー
- **ドロップゾーン**（`#dropzone`、クリックでも `<input type="file" accept=".html,.htm">` を開く、`#fileInput`）
- アップロード結果表示エリア（`#result`、初期 hidden。URL とコピーボタン `#copyBtn`）
- **一覧**: `documents` をカードで表示（タイトル、相対 URL `/d/:slug`、作成日時、サイズ、開く/コピー/削除ボタン）。空なら空状態メッセージ。

### src/http/web/client.ts（素 TS・ビルド無し、起動時トランスパイル）
ふるまい:
- dragover/dragleave/drop のデフォルト抑止＋ドロップゾーンのハイライト
- drop もしくは file input change で 1ファイル取得 → 拡張子 `.html/.htm` 検証
- `FormData` に `file` を入れ `fetch("/api/upload", { method: "POST", body: form })`
- 成功(201): `#result` に発行 URL（絶対 URL `location.origin + data.url`）を表示、コピーボタンで `navigator.clipboard.writeText`、一覧を再取得（`/api/documents`）して再描画 or `location.reload()`
- 失敗(400): エラーメッセージ表示
- 削除ボタン: `fetch("/api/documents/:slug", { method: "DELETE" })` → 成功で行を消す or reload
- テーマトグルボタン: `data-theme` を light/dark 切替し `localStorage` に保存

### src/http/routes/home.ts
```ts
export function homeRoutes(deps: AppDeps): Hono
// GET "/" : const docs = await listDocuments({ repo: deps.repo });
//           return c.html(<Layout title="pagebox"><HomePage documents={docs} /></Layout>)
```

### src/http/routes/api.ts
```ts
export function apiRoutes(deps: AppDeps): Hono
```
- `POST "/upload"`: `const form = await c.req.formData(); const file = form.get("file");` → File でなければ 400。`bytes = new Uint8Array(await file.arrayBuffer())`。`uploadDocument({storage,repo}, { fileName: file.name, contentType: file.type || "text/html", bytes })` を try/catch。成功で `c.json({ slug, url: `/d/${meta.slug}`, title }, 201)`。`ValidationError` は `c.json({ error: e.message }, 400)`。
- `GET "/documents"`: `return c.json(await listDocuments({ repo: deps.repo }))`
- `DELETE "/documents/:slug"`: `const ok = await deleteDocument({storage,repo}, c.req.param("slug")); return ok ? c.body(null,204) : c.json({error:"not found"},404)`

### src/http/routes/viewer.ts
```ts
export function viewerRoutes(deps: AppDeps): Hono
// GET "/:slug":
//   const r = await getDocument({storage,repo}, c.req.param("slug"));
//   if (!r) return c.text("Not found", 404);
//   c.header("Content-Type", `${r.meta.contentType}; charset=utf-8`);
//   // iframe 埋め込み許可: X-Frame-Options は付けない
//   return c.body(r.data);
// （/d にマウントされるので実 URL は /d/:slug）
```
コメントで「MVP は同一ドメイン raw 配信。将来はサブドメイン隔離で XSS リスクを下げる」と明記。

### src/entries/bun.ts
```ts
import { loadConfig, createContainer } from "../config/container";
const config = loadConfig(process.env);
const { app } = createContainer(config);
const server = Bun.serve({ port: config.port, fetch: app.fetch });
console.log(`pagebox listening on http://localhost:${server.port}`);
```

### src/entries/worker.ts（枠）
Phase2 用スタブ。コメントで「Workers env から R2/D1 binding を読み container を組む」TODO と、`export default { fetch }` の形だけ置く。

---

## 設定ファイル

### package.json（scripts）
```
"dev":   "bun run --watch src/entries/bun.ts",
"start": "bun run src/entries/bun.ts",
"typecheck": "tsc --noEmit",
"db:generate": "drizzle-kit generate"
```

### tsconfig.json（要点）
`target/module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `jsxImportSource: hono/jsx`, `strict: true`, `types: ["@types/bun"]`, `verbatimModuleSyntax: true`。

### drizzle.config.ts
`dialect: "sqlite"`, `schema: "src/db/schema.ts"`, `out: "src/db/migrations"`（将来のマイグレーション用。MVP は client.ts のブートストラップで動くため未使用でも可）。

### .gitignore / .dockerignore
`node_modules`, `data/`, `*.db`, `*.db-*`（WAL）。dockerignore はさらに `.git`, `docs`。

### deploy/docker/Dockerfile
```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json ./
COPY bun.lock* ./
RUN bun install
COPY . .
ENV PAGEBOX_DATA_DIR=/data
EXPOSE 3000
CMD ["bun","run","src/entries/bun.ts"]
```

### deploy/docker/compose.yaml
```yaml
services:
  app:
    build: { context: ../.., dockerfile: deploy/docker/Dockerfile }
    ports: ["3000:3000"]
    volumes: ["pagebox-data:/data"]
    environment:
      PORT: "3000"
      PAGEBOX_DATA_DIR: /data
      STORAGE_DRIVER: fs
      DB_DRIVER: sqlite
volumes: { pagebox-data: {} }
```

### deploy/cloudflare/wrangler.toml（枠）
`main = "src/entries/worker.ts"`、R2/D1 binding をコメントで雛形のみ（Phase2）。

---

## 実装順序（この順で進める）

1. プロジェクト初期化: `package.json`/`tsconfig.json`/`.gitignore`/`.dockerignore`、`bun install`（hono, drizzle-orm, drizzle-kit, @types/bun, typescript）
2. `core/`（ids → document → errors → usecases 4本）
3. `ports/`（storage, repository, auth, thumbnail）
4. `db/`（schema, client）→ `adapters/repository/drizzle.ts`
5. `adapters/storage/fs.ts`（+ s3/r2 枠）、`adapters/auth/anonymous.ts`
6. `http/web/`（style.css → layout.tsx → home.tsx → client.ts → assets.ts）
7. `http/routes/`（home, api, viewer）→ `http/app.ts`
8. `config/container.ts` → `entries/bun.ts`（+ worker 枠）
9. `deploy/docker/`（Dockerfile, compose.yaml）、cloudflare/k8s 枠
10. `docs/` の整合（tech-stack.md 更新、README リンク確認）
11. `bun run typecheck` を通す

## 検証（end-to-end）

ローカル（Bun 直）:
1. `PAGEBOX_DATA_DIR=./data bun run src/entries/bun.ts` → `http://localhost:3000`
2. HTML をドラッグ&ドロップ → 201 と発行 URL を確認
3. `/d/:slug` で HTML がそのままレンダリングされる
4. トップ一覧に出る／削除できる
5. `<iframe src="http://localhost:3000/d/:slug">` で埋め込み表示できる
6. `bun run typecheck` がエラー無し

Docker（Phase1 本番相当）:
7. `docker compose -f deploy/docker/compose.yaml up --build` で同じ操作
8. `docker compose down` → `up` 後も volume の HTML/DB が残る（永続性）

ポータビリティ確認:
9. `core/`・`http/` が `adapters/`・`db/` を import していない（grep で検査）
10. `STORAGE_DRIVER=s3` 起動で「Phase3 で実装」エラーになる（差し替えポイントが機能）
