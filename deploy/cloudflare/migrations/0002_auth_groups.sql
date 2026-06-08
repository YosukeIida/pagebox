CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE user_groups (
  user_id   TEXT NOT NULL REFERENCES users(id),
  group_id  TEXT NOT NULL REFERENCES groups(id),
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, group_id)
);

ALTER TABLE documents ADD COLUMN group_id    TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN uploaded_by TEXT NOT NULL DEFAULT '';
