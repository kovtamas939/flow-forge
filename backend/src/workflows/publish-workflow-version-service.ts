import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import {
  validateWorkflowDefinition,
  type WorkflowDefinitionValidationIssue,
} from "./workflow-definition-validation.js";
import {
  insertImmutableWorkflowVersion,
  lockActiveWorkflowForVersionUpdate,
  updateCurrentWorkflowVersion,
} from "./workflow-version-repository.js";

export type PublishWorkflowVersionResult =
  | {
      published: true;
      versionId: string;
      versionNumber: number;
    }
  | {
      published: false;
      reason: "not_found";
    }
  | {
      published: false;
      reason: "invalid_definition";
      issues: WorkflowDefinitionValidationIssue[];
    };

export async function publishWorkflowVersion(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  createdByUserId: string,
  requestDefinition: unknown,
): Promise<PublishWorkflowVersionResult> {
  const validation = validateWorkflowDefinition(requestDefinition);

  if (!validation.valid) {
    return {
      published: false,
      reason: "invalid_definition",
      issues: validation.issues,
    };
  }

  return withTransaction(pool, async (client) => {
    const currentVersion = await lockActiveWorkflowForVersionUpdate(
      client,
      workspaceId,
      workflowId,
    );

    if (currentVersion === null) {
      return {
        published: false,
        reason: "not_found",
      };
    }

    const nextVersionNumber = currentVersion.versionNumber + 1;

    const newVersionId = await insertImmutableWorkflowVersion(client, {
      workflowId,
      versionNumber: nextVersionNumber,
      schemaVersion: validation.definition.schemaVersion,
      definition: validation.definition,
      createdByUserId,
    });

    const pointerUpdated = await updateCurrentWorkflowVersion(
      client,
      workspaceId,
      workflowId,
      currentVersion.id,
      newVersionId,
    );

    if (!pointerUpdated) {
      throw new Error(
        "Workflow current version changed while its row was locked",
      );
    }

    return {
      published: true,
      versionId: newVersionId,
      versionNumber: nextVersionNumber,
    };
  });
}