ALTER TABLE ontahi_event_deliveries
  MODIFY state enum('pending', 'claimed', 'acknowledged', 'failed') NOT NULL DEFAULT 'pending',
  ADD COLUMN available_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER lease_expires_at,
  ADD COLUMN failed_at datetime(3) AFTER acknowledged_at,
  ADD COLUMN failure_reason text AFTER failed_at,
  DROP INDEX ontahi_event_deliveries_claim_idx,
  ADD INDEX ontahi_event_deliveries_claim_idx
    (subscription_id, state, available_at, created_at, delivery_id);
