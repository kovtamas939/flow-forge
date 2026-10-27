CREATE TABLE execution_step_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  execution_step_id UUID NOT NULL
    REFERENCES execution_steps (id)
    ON DELETE CASCADE,

  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  retryable BOOLEAN,

  result JSONB,
  error_code TEXT,
  failure_summary TEXT,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT execution_step_attempts_number_positive
    CHECK (attempt_number > 0),

  CONSTRAINT execution_step_attempts_status_valid
    CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),

  CONSTRAINT execution_step_attempts_result_object
    CHECK (
      result IS NULL
      OR jsonb_typeof(result) = 'object'
    ),

  CONSTRAINT execution_step_attempts_error_code_length
    CHECK (
      error_code IS NULL
      OR length(error_code) BETWEEN 1 AND 100
    ),

  CONSTRAINT execution_step_attempts_failure_summary_length
    CHECK (
      failure_summary IS NULL
      OR length(failure_summary) BETWEEN 1 AND 500
    ),

  CONSTRAINT execution_step_attempts_state_consistent
    CHECK (
      (
        status = 'RUNNING'
        AND retryable IS NULL
        AND error_code IS NULL
        AND failure_summary IS NULL
        AND finished_at IS NULL
      )
      OR
      (
        status = 'SUCCEEDED'
        AND retryable = FALSE
        AND error_code IS NULL
        AND failure_summary IS NULL
        AND finished_at IS NOT NULL
      )
      OR
      (
        status = 'FAILED'
        AND retryable IS NOT NULL
        AND error_code IS NOT NULL
        AND failure_summary IS NOT NULL
        AND finished_at IS NOT NULL
      )
    ),

  CONSTRAINT execution_step_attempts_number_unique
    UNIQUE (execution_step_id, attempt_number)
);