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

export const documents = sqliteTable("documents", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  groupId: text("group_id").notNull().references(() => groups.id),
  uploadedBy: text("uploaded_by").notNull().references(() => users.id),
});
