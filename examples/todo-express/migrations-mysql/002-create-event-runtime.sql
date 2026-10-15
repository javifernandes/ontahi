CREATE TABLE ontahi_event_occurrences (
  occurrence_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  acceptance_order bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE,
  event_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  event_version integer NOT NULL,
  occurred_at varchar(30) NOT NULL,
  payload json NOT NULL,
  causation json,
  correlation json,
  CONSTRAINT ontahi_event_occurrences_event_version_chk CHECK (event_version > 0),
  INDEX ontahi_event_occurrences_event_idx (event_id, event_version, acceptance_order)
) ENGINE=InnoDB;

CREATE TABLE ontahi_event_subscriptions (
  subscription_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  event_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  event_version integer NOT NULL,
  correlation json NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ontahi_event_subscriptions_event_version_chk CHECK (event_version > 0)
) ENGINE=InnoDB;

CREATE TABLE ontahi_event_deliveries (
  delivery_id varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  subscription_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  occurrence_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  state enum('pending', 'claimed', 'acknowledged') NOT NULL DEFAULT 'pending',
  claim_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin,
  claimed_by varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin,
  lease_expires_at datetime(3),
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  acknowledged_at datetime(3),
  CONSTRAINT ontahi_event_deliveries_attempt_chk CHECK (attempt >= 0),
  UNIQUE KEY ontahi_event_deliveries_subscription_occurrence_key
    (subscription_id, occurrence_id),
  INDEX ontahi_event_deliveries_claim_idx
    (subscription_id, state, created_at, delivery_id),
  CONSTRAINT ontahi_event_deliveries_subscription_fk FOREIGN KEY (subscription_id)
    REFERENCES ontahi_event_subscriptions (subscription_id),
  CONSTRAINT ontahi_event_deliveries_occurrence_fk FOREIGN KEY (occurrence_id)
    REFERENCES ontahi_event_occurrences (occurrence_id)
) ENGINE=InnoDB;
