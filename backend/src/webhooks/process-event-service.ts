import type { Pool } from "pg";
import { runWorkflowForExecution } from "../executions/run-workflow-service.js";
import { getOrCreateExecutionForEvent } from "../executions/execution-service.js";
import { recoverUnknownActionOutcome } from "../executions/recover-unknown-action-outcome-service.js";
import {
  createHttpRequestAdapter,
} from "../workflows/actions/http-request-adapter.js";
import {
  createUnconfiguredNotificationAdapter,
} from "../workflows/actions/notification-adapter.js";
import type {
  WorkflowActionAdapters,
} from "../executions/run-workflow-service.js";
import type { StructuredLogger } from "../observability/structured-logger.js";
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

const DEFAULT_ACTION_ADAPTERS: WorkflowActionAdapters = {
  httpRequest: createHttpRequestAdapter(),
  notification: createUnconfiguredNotificationAdapter(),
};

export async function processEvent(
  pool: Pool,
  eventId: string,
  logger: StructuredLogger,
  actionAdapters: WorkflowActionAdapters = DEFAULT_ACTION_ADAPTERS,
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

      break;
  }

  const recoveryResult = await recoverUnknownActionOutcome(pool, {
    executionId: executionResult.execution.id,
    actions: result.definition.actions,
  });

  if (!recoveryResult.recovered) {
    if (recoveryResult.reason === "claim_unavailable") {
      logger.info(
        {
          eventId: result.eventId,
          executionId: executionResult.execution.id,
        },
        "Execution is already being processed by another worker",
      );
      return;
    }
  } else {
    logger.error(
      {
        eventId: result.eventId,
        executionId: executionResult.execution.id,
        stepId: recoveryResult.stepId,
        errorCode: recoveryResult.errorCode,
      },
      "Workflow execution stopped because an action outcome is unknown",
    );
    return;
  }

  const runResult = await runWorkflowForExecution(pool, {
    execution: executionResult.execution,
    definition: result.definition,
    payload: result.payload,
    actionAdapters,
    logger,
  });

  switch (runResult.status) {
    case "completed":
      logger.info(
        {
          eventId: result.eventId,
          executionId: executionResult.execution.id,
        },
        "Workflow execution completed",
      );
      return;

    case "failed":
      logger.error(
        {
          eventId: result.eventId,
          executionId: executionResult.execution.id,
          errorCode: runResult.errorCode,
        },
        "Workflow execution failed",
      );
      return;

    case "already_terminal":
      logger.info(
        {
          eventId: result.eventId,
          executionId: executionResult.execution.id,
          executionStatus: executionResult.execution.status,
        },
        "Ignoring duplicate delivery for terminal execution",
      );
      return;

    case "state_changed":
      logger.info(
        {
          eventId: result.eventId,
          executionId: executionResult.execution.id,
        },
        "Execution state changed before workflow processing",
      );
      return;
  }
}