# FlowForge Workflow Engine

The FlowForge workflow engine evaluates webhook event payloads against versioned workflow definitions and runs the configured actions. The worker loads the event and the exact published definition version from PostgreSQL, evaluates conditions, executes actions in order, and records the outcome of each step and attempt.

## Workflow definition

A workflow definition is a JSON document with a schema version, a trigger, optional conditions, and an ordered list of actions. It supports webhook triggers.

```json
{
  "schemaVersion": 1,
  "trigger": { "type": "webhook" },
  "conditions": [
    {
      "id": "large-order",
      "path": "/order/total",
      "operator": "greater_than_or_equal",
      "value": 100
    }
  ],
  "actions": [
    {
      "id": "notify-operations",
      "type": "notification",
      "recipient": "ops@example.com",
      "message": "A qualifying order was received."
    }
  ]
}
```

The definition is validated before publication. Its `schemaVersion` is stored both in the JSON document and in the corresponding PostgreSQL version record; the two values must agree. Every condition and action has a stable identifier, unique within its definition. Published definitions are immutable. An execution uses the version pinned to its accepted event, so later edits do not change work already in progress or its history.

## Conditions

Each condition reads a value from the event payload using a [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) path, for example `/order/total` or `/items/0/sku`. If `conditions` is omitted, the workflow matches every event. If conditions are present, all of them must match (AND semantics). The engine evaluates and records each condition result, even after one has failed to match.

Supported operators are:

| Operator                                                                   | Matching behavior                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `exists`                                                                   | Matches when the path resolves. A present `null` value exists; a missing path does not. This operator does not take a `value`. |
| `equals`                                                                   | Matches when the path exists and both values are JSON scalars of the same type and value.                                      |
| `not_equals`                                                               | Matches when the path exists and both values are JSON scalars with different type or value. A missing path does not match.     |
| `greater_than`, `greater_than_or_equal`, `less_than`, `less_than_or_equal` | Compare finite numbers only.                                                                                                   |
| `contains`                                                                 | For a string, matches a string substring. For an array, matches an element that is a JSON scalar of the same type and value.   |

For equality operators, JSON scalars are strings, numbers, booleans, and `null`. Objects and arrays are not compared as whole values. Type mismatches do not match, so the number `5` is not equal to the string `"5"`. Numeric comparisons do not match missing, `null`, or non-numeric values. A non-string, non-array source does not match `contains`.

Condition evaluation is deterministic and does not perform I/O. Each condition is recorded as a completed execution step with a result such as `{ "matched": true }`. If any condition does not match, all action steps are marked `SKIPPED` with the reason `condition_mismatch`; the execution itself completes successfully because the workflow was evaluated as designed.

## Actions

Actions execute sequentially in the order defined by the workflow.

- **`log`** — writes a configured, bounded message with execution and step identifiers to the worker's structured log. The event payload is not copied into the log result.
- **`notification`** — sends a configured recipient and plain-text message through the notification adapter. When Gmail settings are provided to the worker, the adapter sends email using Gmail SMTP and the fixed subject `FlowForge notification`. The action does not interpolate values from the event payload. Without a configured provider, the action fails with `NOTIFICATION_PROVIDER_NOT_CONFIGURED`.
- **`http_request`** — sends an HTTP or HTTPS request using `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`; an optional JSON body may be supplied.

An action failure stops later actions. A retryable failure is retried by BullMQ within the configured attempt limit. A permanent failure marks the action and execution as failed; later pending action steps are skipped. The engine records safe outcome metadata rather than secrets, full payloads, response bodies, or raw provider errors.

### Outbound HTTP controls

The `http_request` adapter accepts only HTTP and HTTPS URLs and rejects URLs containing embedded user information. It resolves and validates destination addresses, rejecting loopback, private, link-local, multicast, unspecified, and reserved addresses. The connection uses the validated address to reduce DNS rebinding risk. Redirects are not followed.

Requests have a five-second timeout. Serialized request bodies and response bodies are each limited to 64 KiB. A 2xx response is successful; a 5xx response and network timeout are retryable; 4xx responses, redirects, policy violations, and size-limit violations are permanent failures. The response body is not persisted.

## Execution records

PostgreSQL stores an execution record, one execution step for each condition and action, and separate attempt records for action invocations. Step identifiers correspond to the stable identifiers in the immutable definition. The definition itself is not duplicated into step rows; the pinned workflow version remains the source of configuration.

Condition steps record whether they matched. Action steps record completion, skipping, or failure, and each attempt records its number, status, timing, retryability, and bounded failure information. These records provide durable execution history independently of Redis queue state.

## Retries, concurrency, and uncertain outcomes

BullMQ delivery is at least once, so a job can be delivered more than once. Before running an execution, the worker takes a PostgreSQL session-level advisory lock scoped to that execution. This prevents two jobs from running the same execution concurrently. The lock is released when processing completes or its database connection closes.

Known transient failures are retried with bounded queue attempts and backoff. If attempts are exhausted, the execution and failed step are finalized in PostgreSQL rather than left in a running state. Permanent failures are not retried as transient errors.

An external action may succeed immediately before a worker stops, leaving FlowForge unable to persist the result. On recovery, an action attempt still marked `RUNNING` is changed to `UNKNOWN`; its action and execution are failed with `ACTION_OUTCOME_UNKNOWN`, and the action is not automatically repeated. This avoids silently duplicating a possible external side effect. It does not provide exactly-once delivery: external systems may process a request before FlowForge can record its outcome.

## Workflow lifecycle and event binding

Workflows have `DRAFT`, `ACTIVE`, and `DISABLED` states. Draft definitions can be edited. Activation validates the complete definition and publishes an immutable version as part of the lifecycle transition. Editing an active workflow publishes a new version rather than modifying an existing one.

An active workflow accepts new webhook events. When an event is accepted, its selected workflow version is stored with the durable event and execution state. Disabling the workflow prevents new work from being accepted; previously accepted events continue to use their pinned version.
