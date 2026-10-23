import type { Pool } from "pg";
import {
  getOrCreateExecutionForEvent,
} from "../executions/execution-service.js";
import { loadPinnedEventWorkflowDefinition } from "../workflows/load-pinned-event-workflow-definition-service.js";

export class EventNotFoundError extends Error {
  public constructor(eventId: string) {
    super(`Event ${eventId} was not found`);
    this.name = "EventNotFoundError";
  }
}

export class PermanentEventProcessingError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PermanentEventProcessingError";
  }
}

export async function processEvent(
  pool: Pool,
  eventId: string,
): Promise<void> {
  const result = await loadPinnedEventWorkflowDefinition(pool, eventId);

  switch (result.status) {
    case "event_not_found":
      throw new EventNotFoundError(eventId);

    case "version_not_pinned":
      throw new PermanentEventProcessingError(
        `Event ${result.eventId} has no pinned workflow version`,
      );

    case "version_not_found":
      throw new PermanentEventProcessingError(
        `Pinned workflow version ${result.workflowVersionId} was not found`,
      );

    case "invalid_definition":
      throw new PermanentEventProcessingError(
        `Workflow version ${result.workflowVersionId} has an invalid definition with ${result.issues.length} validation issue(s)`,
      );

    case "schema_version_mismatch":
      throw new PermanentEventProcessingError(
        `Workflow version ${result.workflowVersionId} has database schema version ${result.databaseSchemaVersion}, but definition schema version ${result.definitionSchemaVersion}`,
      );

    case "loaded":
      break;
  }

  const executionResult = await getOrCreateExecutionForEvent(
    pool,
    result.eventId,
  );

  switch (executionResult.status) {
    case "event_not_found":
      throw new EventNotFoundError(result.eventId);

    case "version_not_pinned":
      throw new PermanentEventProcessingError(
        `Event ${executionResult.eventId} has no pinned workflow version`,
      );

    case "ready":
      if (
        executionResult.execution.workflowId !== result.workflowId ||
        executionResult.execution.workflowVersionId !== result.workflowVersionId
      ) {
        throw new PermanentEventProcessingError(
          `Execution ${executionResult.execution.id} does not match the event's pinned workflow version`,
        );
      }

      console.info(
        {
          eventId: result.eventId,
          workflowId: result.workflowId,
          workflowVersionId: result.workflowVersionId,
          versionNumber: result.versionNumber,
          schemaVersion: result.schemaVersion,
          executionId: executionResult.execution.id,
          executionStatus: executionResult.execution.status,
          attemptCount: executionResult.execution.attemptCount,
          executionCreated: executionResult.created,
        },
        "Prepared durable execution for pinned workflow version",
      );
      return;
  }
}