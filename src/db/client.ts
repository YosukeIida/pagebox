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
  // 既存ボリュームに description カラムがない場合に追加（SQLite は IF NOT EXISTS 非対応）
  try { sqlite.exec(`ALTER TABLE documents ADD COLUMN description TEXT;`); } catch { /* already exists */ }
  return drizzle(sqlite, { schema });
}
