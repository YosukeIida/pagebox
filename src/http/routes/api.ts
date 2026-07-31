import { Hono } from "hono";
import type { AppDeps } from "../app";
import type { AuthContext } from "../../ports/auth";
import { uploadDocument } from "../../core/usecases/upload-document";
import { addDocumentVersion } from "../../core/usecases/add-document-version";
import { rollbackDocumentVersion } from "../../core/usecases/rollback-document-version";
import { findVersionCandidates } from "../../core/usecases/find-version-candidates";
import { listDocuments } from "../../core/usecases/list-documents";
import { deleteDocument } from "../../core/usecases/delete-document";
import { NotFoundError, ValidationError } from "../../core/errors";
import { viewUrl } from "../../core/urls";
import { requireAuth } from "../middleware/require-auth";
import { uploadRateLimit } from "../middleware/rate-limit";
import { UpdateChoices } from "../web/components/UpdateChoices";

type Vars = { Variables: { authContext: AuthContext } };

// クライアントは先頭 4KB を送る。多少の余裕を見て上限を置き、
// それ以上は切り捨てる（title 判定に必要なのは <head> だけ）。
const MAX_HEAD_SNIPPET_LENGTH = 16 * 1024;
const MAX_FILE_NAME_LENGTH = 512;

export function apiRoutes(deps: AppDeps): Hono {
  const app = new Hono<Vars>();
  app.use("/*", requireAuth(deps));

  // アップロード前の候補判定。同名 / 同 title の既存ドキュメントがあれば
  // 「既存の新バージョンにするか、新規公開するか」を選ばせるための情報を返す。
  // 書き込みを伴わず、ファイル本体も受け取らない（先頭数 KB のテキストのみ）ため rate limit は掛けない。
  // そのぶん入力は厳しく検証する（未検証だと非文字列で TypeError → 500 になり、
  // 巨大な headSnippet で無制限に正規表現を走らせられる）。
  app.post("/upload/check", async (c) => {
    const { groupId } = c.get("authContext");
    let body: { fileName?: unknown; contentType?: unknown; headSnippet?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON ボディが必要です" }, 400);
    }
    if (typeof body.fileName !== "string" || body.fileName.length === 0) {
      return c.json({ error: "fileName が必要です" }, 400);
    }
    if (body.fileName.length > MAX_FILE_NAME_LENGTH) {
      return c.json({ error: "fileName が長すぎます" }, 400);
    }
    if (body.contentType !== undefined && typeof body.contentType !== "string") {
      return c.json({ error: "contentType が不正です" }, 400);
    }
    if (body.headSnippet !== undefined && typeof body.headSnippet !== "string") {
      return c.json({ error: "headSnippet が不正です" }, 400);
    }
    const headSnippet = (body.headSnippet ?? "").slice(0, MAX_HEAD_SNIPPET_LENGTH);

    const { title, candidates } = await findVersionCandidates(
      { repo: deps.repo },
      {
        fileName: body.fileName,
        contentType: body.contentType ?? "text/html",
        headSnippet,
        groupId,
      },
    );
    // 選択肢の markup は UpdateChoices が唯一の正。クライアントは innerHTML するだけにする。
    const candidatesHtml =
      candidates.length > 0 ? String(UpdateChoices({ candidates })) : "";
    return c.json({
      title,
      candidates: candidates.map((d) => ({
        slug: d.slug,
        title: d.title,
        latestVersion: d.latestVersion,
        originalName: d.originalName,
      })),
      candidatesHtml,
    });
  });

  app.post("/upload", uploadRateLimit(deps.rateLimiter) as any, async (c) => {
    const { groupId, userId } = c.get("authContext");
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "file フィールドが必要です" }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const meta = await uploadDocument(
        { storage: deps.storage, repo: deps.repo },
        { fileName: file.name, contentType: file.type || "text/html", bytes, groupId, uploadedBy: userId },
      );
      deps.analytics.recordUpload(meta.slug, { userEmail: c.get("authContext").email, fileSizeBytes: meta.size });
      return c.json(
        {
          slug: meta.slug,
          url: viewUrl(deps.origins, meta.slug),
          title: meta.title,
          version: meta.latestVersion,
        },
        201,
      );
    } catch (e) {
      if (e instanceof ValidationError) {
        return c.json({ error: e.message }, 400);
      }
      throw e;
    }
  });

  // 既存ドキュメントに新しい版を追記する（共有 URL は変わらない）。
  app.post("/documents/:slug/versions", uploadRateLimit(deps.rateLimiter) as any, async (c) => {
    const { groupId, userId } = c.get("authContext");
    const slug = c.req.param("slug");
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "file フィールドが必要です" }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const version = await addDocumentVersion(
        { storage: deps.storage, repo: deps.repo },
        { slug, fileName: file.name, contentType: file.type || "text/html", bytes, groupId, createdBy: userId },
      );
      deps.analytics.recordUpload(slug, { userEmail: c.get("authContext").email, fileSizeBytes: version.size });
      return c.json(
        { slug, url: viewUrl(deps.origins, slug), title: version.title, version: version.version },
        201,
      );
    } catch (e) {
      if (e instanceof ValidationError) return c.json({ error: e.message }, 400);
      if (e instanceof NotFoundError) return c.json({ error: e.message }, 404);
      throw e;
    }
  });

  app.get("/documents/:slug/versions", async (c) => {
    const { groupId } = c.get("authContext");
    const slug = c.req.param("slug");
    const doc = await deps.repo.findBySlug(slug);
    if (!doc || doc.groupId !== groupId) return c.json({ error: "not found" }, 404);
    const versions = await deps.repo.listVersions(slug);
    return c.json({ slug, latestVersion: doc.latestVersion, versions });
  });

  // 過去の版に戻す。append-only なので、その版の中身を複製して新しい最新版にする。
  // R2 の get + put（最大 10MB）と insert が走り、保持は無制限なので
  // アップロードと同じレート制限を掛ける（掛けないと制限を迂回して版を量産できる）。
  app.post("/documents/:slug/versions/:version/rollback", uploadRateLimit(deps.rateLimiter) as any, async (c) => {
    const { groupId, userId } = c.get("authContext");
    const slug = c.req.param("slug");
    const version = Number(c.req.param("version"));
    if (!Number.isSafeInteger(version) || version < 1) {
      return c.json({ error: "バージョン番号が不正です" }, 400);
    }
    try {
      const created = await rollbackDocumentVersion(
        { storage: deps.storage, repo: deps.repo },
        { slug, version, groupId, createdBy: userId },
      );
      return c.json({ slug, url: viewUrl(deps.origins, slug), version: created.version, sourceVersion: version }, 201);
    } catch (e) {
      if (e instanceof ValidationError) return c.json({ error: e.message }, 400);
      if (e instanceof NotFoundError) return c.json({ error: e.message }, 404);
      throw e;
    }
  });

  app.get("/documents", async (c) => {
    const { groupId } = c.get("authContext");
    const docs = await listDocuments({ repo: deps.repo }, groupId);
    return c.json(docs);
  });

  app.delete("/documents/:slug", async (c) => {
    const { groupId } = c.get("authContext");
    const slug = c.req.param("slug");
    const deleted = await deleteDocument({ storage: deps.storage, repo: deps.repo }, slug, groupId);
    if (!deleted) return c.json({ error: "not found" }, 404);
    // OGP 画像キャッシュは版ごとにキーが分かれており列挙できないので、削除した版を明示的に掃除する。
    // 削除自体はもう完了しているため、掃除の失敗で 500 を返してはいけない
    // （呼び出し側が再試行しても文書は既に 404 で、残りの KV を掃除できなくなる）。
    if (deps.ogCache) {
      for (const v of deleted) {
        await deps.ogCache.delete(`${slug}:v${v.version}`).catch(() => { /* TTL 切れで消える */ });
      }
    }
    return c.body(null, 204);
  });

  return app as unknown as Hono;
}
