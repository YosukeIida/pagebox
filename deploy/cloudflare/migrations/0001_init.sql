CREATE TABLE IF NOT EXISTS documents (
  slug         TEXT    PRIMARY KEY,
  title        TEXT    NOT NULL,
  original_name TEXT   NOT NULL,
  size         INTEGER NOT NULL,
  content_type TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);
