ALTER TABLE workflow_versions
  ADD CONSTRAINT workflow_versions_workflow_id_id_unique
  UNIQUE (workflow_id, id);

ALTER TABLE workflows
  ADD COLUMN current_version_id UUID;

UPDATE workflows AS workflow
SET current_version_id = (
  SELECT version.id
  FROM workflow_versions AS version
  WHERE version.workflow_id = workflow.id
  ORDER BY version.version_number DESC
  LIMIT 1
);

ALTER TABLE workflows
  ADD CONSTRAINT workflows_current_version_belongs_to_workflow
  FOREIGN KEY (id, current_version_id)
  REFERENCES workflow_versions (workflow_id, id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE workflows
  ADD CONSTRAINT workflows_active_requires_current_version
  CHECK (
    status <> 'ACTIVE'
    OR current_version_id IS NOT NULL
  );