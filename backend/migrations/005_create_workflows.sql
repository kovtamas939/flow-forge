CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id UUID NOT NULL
    REFERENCES workspaces (id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',

  created_by_user_id UUID
    REFERENCES users (id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workflows_name_length
    CHECK (length(trim(name)) BETWEEN 1 AND 120),

  CONSTRAINT workflows_status_valid
    CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED'))
);

CREATE INDEX workflows_workspace_created_at_idx
  ON workflows (workspace_id, created_at DESC);

CREATE TABLE workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  workflow_id UUID NOT NULL
    REFERENCES workflows (id)
    ON DELETE CASCADE,

  version_number INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  definition JSONB NOT NULL,

  created_by_user_id UUID
    REFERENCES users (id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workflow_versions_number_positive
    CHECK (version_number > 0),

  CONSTRAINT workflow_versions_schema_version_positive
    CHECK (schema_version > 0),

  CONSTRAINT workflow_versions_definition_object
    CHECK (jsonb_typeof(definition) = 'object'),

  CONSTRAINT workflow_versions_workflow_number_unique
    UNIQUE (workflow_id, version_number)
);