import type { Pool } from "pg";
import { findPinnedWorkflowVersionForEvent } from "./pinned-event-workflow-version-repository.js";
import {
  validateWorkflowDefinition,
  type WorkflowDefinitionValidationIssue,
} from "./workflow-definition-validation.js";
import type { WorkflowDefinitionV1 } from "./workflow-definition.js";

export type LoadPinnedEventWorkflowDefinitionResult =
  | {
      status: "event_not_found";
    }
  | {
      status: "version_not_pinned";
      eventId: string;
      workflowId: string;
    }
  | {
      status: "version_not_found";
      eventId: string;
      workflowId: string;
      workflowVersionId: string;
    }
  | {
      status: "invalid_definition";
      eventId: string;
      workflowVersionId: string;
      issues: WorkflowDefinitionValidationIssue[];
    }
  | {
      status: "schema_version_mismatch";
      eventId: string;
      workflowVersionId: string;
      databaseSchemaVersion: number;
      definitionSchemaVersion: number;
    }
  | {
      status: "loaded";
      eventId: string;
      workflowId: string;
      workflowVersionId: string;
      versionNumber: number;
      schemaVersion: number;
      definition: WorkflowDefinitionV1;
    };

export async function loadPinnedEventWorkflowDefinition(
  pool: Pool,
  eventId: string,
): Promise<LoadPinnedEventWorkflowDefinitionResult> {
  const lookup = await findPinnedWorkflowVersionForEvent(pool, eventId);

  if (lookup.status !== "loaded") {
    return lookup;
  }

  const validation = validateWorkflowDefinition(lookup.definition);

  if (!validation.valid) {
    return {
      status: "invalid_definition",
      eventId: lookup.eventId,
      workflowVersionId: lookup.workflowVersionId,
      issues: validation.issues,
    };
  }

  if (lookup.schemaVersion !== validation.definition.schemaVersion) {
    return {
      status: "schema_version_mismatch",
      eventId: lookup.eventId,
      workflowVersionId: lookup.workflowVersionId,
      databaseSchemaVersion: lookup.schemaVersion,
      definitionSchemaVersion: validation.definition.schemaVersion,
    };
  }

  return {
    status: "loaded",
    eventId: lookup.eventId,
    workflowId: lookup.workflowId,
    workflowVersionId: lookup.workflowVersionId,
    versionNumber: lookup.versionNumber,
    schemaVersion: lookup.schemaVersion,
    definition: validation.definition,
  };
}