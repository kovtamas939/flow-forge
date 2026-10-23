ALTER TABLE webhooks
  ADD CONSTRAINT webhooks_id_workflow_id_unique
  UNIQUE (id, workflow_id);

ALTER TABLE events
  ADD COLUMN workflow_id UUID,
  ADD COLUMN workflow_version_id UUID;

UPDATE events AS event
SET workflow_id = webhook.workflow_id
FROM webhooks AS webhook
WHERE webhook.id = event.webhook_id;

ALTER TABLE events
  ALTER COLUMN workflow_id SET NOT NULL;

ALTER TABLE events
  ADD CONSTRAINT events_webhook_workflow_fk
  FOREIGN KEY (webhook_id, workflow_id)
  REFERENCES webhooks (id, workflow_id)
  ON DELETE RESTRICT;

ALTER TABLE events
  ADD CONSTRAINT events_workflow_version_fk
  FOREIGN KEY (workflow_id, workflow_version_id)
  REFERENCES workflow_versions (workflow_id, id)
  ON DELETE RESTRICT;