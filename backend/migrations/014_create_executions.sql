ALTER TABLE events
  ADD CONSTRAINT events_execution_pin_unique
  UNIQUE (id, workflow_id, workflow_version_id);

CREATE TABLE executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id UUID NOT NULL UNIQUE,
  workflow_id UUID NOT NULL,
  workflow_version_id UUID NOT NULL,

  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,

  last_error_code TEXT,
  last_error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT executions_event_pin_fk
    FOREIGN KEY (event_id, workflow_id, workflow_version_id)
    REFERENCES events (id, workflow_id, workflow_version_id)
    ON DELETE RESTRICT,

  CONSTRAINT executions_workflow_version_fk
    FOREIGN KEY (workflow_id, workflow_version_id)
    REFERENCES workflow_versions (workflow_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT executions_status_valid
    CHECK (
      status IN (
        'PENDING',
        'RUNNING',
        'RETRY_PENDING',
        'COMPLETED',
        'FAILED'
      )
    ),

  CONSTRAINT executions_attempt_count_nonnegative
    CHECK (attempt_count >= 0),

  CONSTRAINT executions_error_code_length
    CHECK (
      last_error_code IS NULL
      OR length(last_error_code) BETWEEN 1 AND 100
    ),

  CONSTRAINT executions_error_message_length
    CHECK (
      last_error_message IS NULL
      OR length(last_error_message) BETWEEN 1 AND 1000
    )
);

CREATE INDEX executions_workflow_created_at_idx
  ON executions (workflow_id, created_at DESC);