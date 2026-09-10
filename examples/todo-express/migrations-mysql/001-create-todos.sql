DELIMITER $$
CREATE TABLE todo_lists (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(100) NOT NULL,
  next_item_position BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB COLLATE=utf8mb4_0900_bin$$
CREATE TABLE todo_items (
  id VARCHAR(191) PRIMARY KEY,
  list_id VARCHAR(191) NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL,
  list_position BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES todo_lists(id),
  INDEX todo_items_list_position_idx (list_id, list_position)
) ENGINE=InnoDB COLLATE=utf8mb4_0900_bin$$
CREATE TABLE tags (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(100) NOT NULL
) ENGINE=InnoDB COLLATE=utf8mb4_0900_bin$$
CREATE TABLE todo_tags (
  todo_id VARCHAR(191) NOT NULL,
  tag_id VARCHAR(191) NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todo_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB COLLATE=utf8mb4_0900_bin$$
CREATE TRIGGER todo_item_initial_position BEFORE INSERT ON todo_items FOR EACH ROW
BEGIN
  UPDATE todo_lists SET next_item_position = next_item_position + 1 WHERE id = NEW.list_id;
  SET NEW.list_position = (SELECT next_item_position FROM todo_lists WHERE id = NEW.list_id);
END$$
DELIMITER ;
