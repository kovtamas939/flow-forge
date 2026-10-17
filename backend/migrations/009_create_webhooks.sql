ALTER TABLE workflows
  ADD CONSTRAINT workflows_workspace_id_id_unique
  UNIQUE (workspace_id, id);

CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id UUID NOT NULL,
  workflow_id UUID NOT NULL,

  secret_ciphertext BYTEA NOT NULL,
  secret_nonce BYTEA NOT NULL,
  secret_auth_tag BYTEA NOT NULL,
  secret_version INTEGER NOT NULL DEFAULT 1,
  secret_encryption_key_version INTEGER NOT NULL DEFAULT 1,

  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  secret_rotated_at TIMESTAMPTZ,

  created_by_user_id UUID
    REFERENCES users (id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT webhooks_workflow_workspace_fk
    FOREIGN KEY (workspace_id, workflow_id)
    REFERENCES workflows (workspace_id, id)
    ON DELETE CASCADE,

  CONSTRAINT webhooks_secret_nonce_length
    CHECK (octet_length(secret_nonce) = 12),

  CONSTRAINT webhooks_secret_auth_tag_length
    CHECK (octet_length(secret_auth_tag) = 16),

  CONSTRAINT webhooks_secret_version_positive
    CHECK (secret_version > 0),

  CONSTRAINT webhooks_encryption_key_version_positive
    CHECK (secret_encryption_key_version > 0)
);

CREATE INDEX webhooks_workspace_workflow_idx
  ON webhooks (workspace_id, workflow_id);