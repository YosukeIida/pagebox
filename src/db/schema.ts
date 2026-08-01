import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const userGroups = sqliteTable("user_groups", {
  userId: text("user_id").notNull().references(() => users.id),
  groupId: text("group_id").notNull().references(() => groups.id),
  role: text("role").notNull().default("member"),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.groupId] }) }));

// 論理ドキュメント（= 共有 URL の単位）。title 等は最新版のスナップショットを保持する。
export const documents = sqliteTable("documents", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  groupId: text("group_id").notNull().references(() => groups.id),
  uploadedBy: text("uploaded_by").notNull().references(() => users.id),
  latestVersion: integer("latest_version").notNull().default(1),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

// 版の実体。append-only（ロールバックも「複製して新しい最新版にする」で表現する）。
// storage_key は版ごとに独立させ、v1 以前の既存オブジェクト（{slug}.html）も同じ列で扱う。
export const documentVersions = sqliteTable("document_versions", {
  slug: text("slug").notNull().references(() => documents.slug),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  // users への FK は張らない（documents.uploaded_by と対称。理由は 0004_versions.sql のコメント）
  createdBy: text("created_by").notNull(),
  // 「この版に戻す」で複製した元の版番号。null は新規アップロード。
  sourceVersion: integer("source_version"),
}, (t) => ({ pk: primaryKey({ columns: [t.slug, t.version] }) }));
