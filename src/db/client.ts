import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

export type DB = ReturnType<typeof createDb>;

export function createDb(path: string) {
  const sqlite = new Database(path, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at   INTEGER NOT NULL
  );`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    owner_id   TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
  );`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS user_groups (
    user_id   TEXT NOT NULL REFERENCES users(id),
    group_id  TEXT NOT NULL REFERENCES groups(id),
    role      TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, group_id)
  );`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS documents (
    slug          TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    description   TEXT,
    original_name TEXT NOT NULL,
    size          INTEGER NOT NULL,
    content_type  TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    group_id      TEXT NOT NULL REFERENCES groups(id),
    uploaded_by   TEXT NOT NULL REFERENCES users(id)
  );`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS document_versions (
    slug           TEXT    NOT NULL REFERENCES documents(slug),
    version        INTEGER NOT NULL,
    title          TEXT    NOT NULL,
    description    TEXT,
    original_name  TEXT    NOT NULL,
    size           INTEGER NOT NULL,
    content_type   TEXT    NOT NULL,
    storage_key    TEXT    NOT NULL,
    created_at     INTEGER NOT NULL,
    created_by     TEXT    NOT NULL REFERENCES users(id),
    source_version INTEGER,
    PRIMARY KEY (slug, version)
  );`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_document_versions_slug ON document_versions(slug);`);

  // 既存ボリュームに後から入ったカラムを追加する（SQLite の ADD COLUMN は IF NOT EXISTS 非対応）
  try { sqlite.exec(`ALTER TABLE documents ADD COLUMN description TEXT;`); } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE documents ADD COLUMN latest_version INTEGER NOT NULL DEFAULT 1;`); } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE documents ADD COLUMN updated_at INTEGER;`); } catch { /* already exists */ }

  // 既存ドキュメントを v1 として backfill。何度起動しても二重に入らないよう NOT EXISTS で守る。
  // storage_key は旧キー {slug}.html のまま（blob の移動は不要）。
  sqlite.exec(`INSERT INTO document_versions
      (slug, version, title, description, original_name, size, content_type, storage_key, created_at, created_by)
    SELECT d.slug, 1, d.title, d.description, d.original_name, d.size, d.content_type,
           d.slug || '.html', d.created_at, d.uploaded_by
    FROM documents d
    WHERE NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.slug = d.slug);`);
  sqlite.exec(`UPDATE documents SET updated_at = created_at WHERE updated_at IS NULL;`);

  return drizzle(sqlite, { schema });
}
