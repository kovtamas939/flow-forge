CREATE TABLE event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id UUID NOT NULL
    REFERENCES events (id)
    ON DELETE RESTRICT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,

  CONSTRAINT event_outbox_event_unique
    UNIQUE (event_id)
);

CREATE INDEX event_outbox_pending_idx
  ON event_outbox (created_at, id)
  WHERE published_at IS NULL;