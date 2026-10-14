CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id UUID
    REFERENCES workspaces (id)
    ON DELETE SET NULL,

  actor_user_id UUID
    REFERENCES users (id)
    ON DELETE SET NULL,

  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_logs_action_not_blank
    CHECK (length(trim(action)) > 0),

  CONSTRAINT audit_logs_target_type_not_blank
    CHECK (length(trim(target_type)) > 0),

  CONSTRAINT audit_logs_target_id_not_blank
    CHECK (length(trim(target_id)) > 0),

  CONSTRAINT audit_logs_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_logs_workspace_created_at_idx
  ON audit_logs (workspace_id, created_at DESC);