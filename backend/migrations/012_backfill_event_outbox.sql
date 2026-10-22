INSERT INTO event_outbox (event_id)
SELECT events.id
FROM events
ON CONFLICT (event_id) DO NOTHING;