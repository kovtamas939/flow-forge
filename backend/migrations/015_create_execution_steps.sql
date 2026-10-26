CREATE TABLE execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  execution_id UUID NOT NULL
    REFERENCES executions (id)
    ON DELETE CASCADE,

  step_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',

  result JSONB,

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT execution_steps_id_length
    CHECK (length(step_id) BETWEEN 1 AND 64),

  CONSTRAINT execution_steps_order_nonnegative
    CHECK (step_order >= 0),

  CONSTRAINT execution_steps_type_valid
    CHECK (step_type IN ('CONDITION', 'ACTION')),

  CONSTRAINT execution_steps_status_valid
    CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED', 'FAILED')),

  CONSTRAINT execution_steps_result_object
    CHECK (
      result IS NULL
      OR jsonb_typeof(result) = 'object'
    ),

  CONSTRAINT execution_steps_execution_step_id_unique
    UNIQUE (execution_id, step_id),

  CONSTRAINT execution_steps_execution_order_unique
    UNIQUE (execution_id, step_order)
);