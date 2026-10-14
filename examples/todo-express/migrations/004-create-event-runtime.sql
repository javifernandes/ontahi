CREATE TABLE ontahi_event_occurrences (
  occurrence_id text PRIMARY KEY,
  acceptance_order bigserial NOT NULL UNIQUE,
  event_id text NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  causation jsonb,
  correlation jsonb
);

CREATE INDEX ontahi_event_occurrences_event_idx
  ON ontahi_event_occurrences (event_id, event_version, acceptance_order);

CREATE TABLE ontahi_event_subscriptions (
  subscription_id text PRIMARY KEY,
  event_id text NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  correlation jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ontahi_event_deliveries (
  delivery_id text PRIMARY KEY,
  subscription_id text NOT NULL REFERENCES ontahi_event_subscriptions (subscription_id),
  occurrence_id text NOT NULL REFERENCES ontahi_event_occurrences (occurrence_id),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'acknowledged')),
  claim_id text,
  claimed_by text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (subscription_id, occurrence_id)
);

CREATE INDEX ontahi_event_deliveries_claim_idx
  ON ontahi_event_deliveries (subscription_id, state, created_at, delivery_id);
