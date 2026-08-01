-- バージョン管理: documents を「共有 URL の単位 + 最新版のスナップショット」に、
-- 実体の履歴を document_versions に持たせる。
CREATE TABLE IF NOT EXISTS document_versions (
  slug           TEXT    NOT NULL REFERENCES documents(slug),
  version        INTEGER NOT NULL,
  title          TEXT    NOT NULL,
  description    TEXT,
  original_name  TEXT    NOT NULL,
  size           INTEGER NOT NULL,
  content_type   TEXT    NOT NULL,
  storage_key    TEXT    NOT NULL,
  created_at     INTEGER NOT NULL,
  -- users(id) への FK は張らない: documents.uploaded_by 自体が FK 無しで
  -- 認証導入前の行に空文字が入り得るため（0002 が DEFAULT '' で追加）、
  -- FK を張ると backfill が FK 違反で migration 全体を巻き戻してしまう。
  created_by     TEXT    NOT NULL,
  source_version INTEGER,
  PRIMARY KEY (slug, version)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_slug ON document_versions(slug);

ALTER TABLE documents ADD COLUMN latest_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN updated_at INTEGER;

-- 既存ドキュメントを v1 として backfill する。
-- storage_key に旧キー {slug}.html をそのまま入れるため R2 オブジェクトの移動は不要。
INSERT INTO document_versions
  (slug, version, title, description, original_name, size, content_type, storage_key, created_at, created_by)
SELECT slug, 1, title, description, original_name, size, content_type, slug || '.html', created_at, uploaded_by
FROM documents;

UPDATE documents SET updated_at = created_at WHERE updated_at IS NULL;
