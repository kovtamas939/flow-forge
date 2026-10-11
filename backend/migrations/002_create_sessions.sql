CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sessions_token_hash_format
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),

  CONSTRAINT sessions_token_hash_unique
    UNIQUE (token_hash),

  CONSTRAINT sessions_expiration_after_creation
    CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx
  ON sessions (user_id);

CREATE INDEX sessions_expires_at_idx
  ON sessions (expires_at);