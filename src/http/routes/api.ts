import { Hono } from "hono";
import type { AppDeps } from "../app";
import type { AuthContext } from "../../ports/auth";
import { uploadDocument } from "../../core/usecases/upload-document";
import { listDocuments } from "../../core/usecases/list-documents";
import { deleteDocument } from "../../core/usecases/delete-document";
import { ValidationError } from "../../core/errors";
import { requireAuth } from "../middleware/require-auth";
import { uploadRateLimit } from "../middleware/rate-limit";

type Vars = { Variables: { authContext: AuthContext } };

export function apiRoutes(deps: AppDeps): Hono {
  const app = new Hono<Vars>();
  app.use("/*", requireAuth(deps));

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
      return c.json({ slug: meta.slug, url: `https://view.pagebox.iodine2.net/${meta.slug}`, title: meta.title }, 201);
    } catch (e) {
      if (e instanceof ValidationError) {
        return c.json({ error: e.message }, 400);
      }
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
    const ok = await deleteDocument({ storage: deps.storage, repo: deps.repo }, slug, groupId);
    return ok ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });

  return app as unknown as Hono;
}
