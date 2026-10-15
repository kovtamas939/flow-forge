ALTER TABLE workflow_versions
  ADD CONSTRAINT workflow_versions_schema_version_matches_definition
  CHECK (
    CASE
      WHEN jsonb_typeof(definition -> 'schemaVersion')
        IS DISTINCT FROM 'number'
      THEN FALSE

      WHEN (definition ->> 'schemaVersion') !~ '^[1-9][0-9]*$'
      THEN FALSE

      ELSE (definition ->> 'schemaVersion')::INTEGER = schema_version
    END
  );