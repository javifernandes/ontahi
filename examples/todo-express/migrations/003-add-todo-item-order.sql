CREATE SEQUENCE todo_item_list_position_seq;

ALTER TABLE todo_items
  ADD COLUMN list_position bigint DEFAULT nextval('todo_item_list_position_seq');

ALTER SEQUENCE todo_item_list_position_seq OWNED BY todo_items.list_position;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY list_id ORDER BY id) AS position
  FROM todo_items
)
UPDATE todo_items
SET list_position = ordered.position
FROM ordered
WHERE todo_items.id = ordered.id;

SELECT setval(
  'todo_item_list_position_seq',
  COALESCE((SELECT max(list_position) FROM todo_items), 0) + 1,
  false
);

ALTER TABLE todo_items
  ALTER COLUMN list_position SET NOT NULL;

CREATE INDEX todo_items_list_position_idx ON todo_items (list_id, list_position);
