ALTER TABLE event_outbox
  ADD COLUMN dispatch_generation INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_reconciled_at TIMESTAMPTZ,
  ADD CONSTRAINT event_outbox_dispatch_generation_nonnegative
    CHECK (dispatch_generation >= 0);

CREATE INDEX event_outbox_reconciliation_idx
  ON event_outbox (last_reconciled_at, created_at, id)
  WHERE published_at IS NOT NULL;