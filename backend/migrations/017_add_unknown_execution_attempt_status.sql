ALTER TABLE execution_step_attempts
  DROP CONSTRAINT execution_step_attempts_status_valid;

ALTER TABLE execution_step_attempts
  ADD CONSTRAINT execution_step_attempts_status_valid
  CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'));

ALTER TABLE execution_step_attempts
  DROP CONSTRAINT execution_step_attempts_state_consistent;

ALTER TABLE execution_step_attempts
  ADD CONSTRAINT execution_step_attempts_state_consistent
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
    OR
    (
      status = 'UNKNOWN'
      AND retryable = FALSE
      AND error_code = 'ACTION_OUTCOME_UNKNOWN'
      AND failure_summary IS NOT NULL
      AND finished_at IS NOT NULL
    )
  );