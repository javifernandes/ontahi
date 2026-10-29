ALTER TABLE ontahi_event_deliveries
  DROP CONSTRAINT ontahi_event_deliveries_state_check,
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN failure_reason text,
  ADD CONSTRAINT ontahi_event_deliveries_state_check
    CHECK (state IN ('pending', 'claimed', 'acknowledged', 'failed'));

DROP INDEX ontahi_event_deliveries_claim_idx;

CREATE INDEX ontahi_event_deliveries_claim_idx
  ON ontahi_event_deliveries
    (subscription_id, state, available_at, created_at, delivery_id);
