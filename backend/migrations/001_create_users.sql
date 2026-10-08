CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  password_hash TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'ACTIVE',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_not_blank
    CHECK (length(trim(email)) > 0),

  CONSTRAINT users_email_normalized_not_blank
    CHECK (length(trim(email_normalized)) > 0),

  CONSTRAINT users_email_normalized_lowercase
    CHECK (email_normalized = lower(email_normalized)),

  CONSTRAINT users_password_hash_not_blank
    CHECK (length(trim(password_hash)) > 0),

  CONSTRAINT users_status_valid
    CHECK (status IN ('ACTIVE', 'DISABLED')),

  CONSTRAINT users_email_normalized_unique
    UNIQUE (email_normalized)
);