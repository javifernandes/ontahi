CREATE TABLE todo_lists (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL
);

CREATE TABLE todo_items (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES todo_lists(id),
  title text NOT NULL,
  completed boolean NOT NULL
);

CREATE TABLE tags (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL
);

CREATE TABLE todo_tags (
  todo_id text NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
  tag_id text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);
