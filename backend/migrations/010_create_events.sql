CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  webhook_id UUID NOT NULL
    REFERENCES webhooks (id)
    ON DELETE RESTRICT,

  external_event_id TEXT NOT NULL,
  payload JSONB NOT NULL,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT events_external_event_id_length
    CHECK (length(external_event_id) BETWEEN 1 AND 200),

  CONSTRAINT events_webhook_external_event_unique
    UNIQUE (webhook_id, external_event_id)
);

CREATE INDEX events_webhook_received_at_idx
  ON events (webhook_id, received_at DESC);