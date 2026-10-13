CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workspaces_name_length
    CHECK (length(trim(name)) BETWEEN 1 AND 120)
);

CREATE TABLE workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id UUID NOT NULL
    REFERENCES workspaces (id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users (id)
    ON DELETE CASCADE,

  role TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workspace_memberships_role_valid
    CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),

  CONSTRAINT workspace_memberships_workspace_user_unique
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX workspace_memberships_user_id_idx
  ON workspace_memberships (user_id);