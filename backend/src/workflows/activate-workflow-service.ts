import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import {
  validateWorkflowDefinition,
  type WorkflowDefinitionValidationIssue,
} from "./workflow-definition-validation.js";
import {
  insertWorkflowVersion,
  lockDraftWorkflowForActivation,
  markWorkflowActive,
  type Workflow,
} from "./workflow-repository.js";

export type ActivateWorkflowResult =
  | {
      activated: true;
      workflow: Workflow;
      versionNumber: 1;
    }
  | {
      activated: false;
      reason: "not_found";
    }
  | {
      activated: false;
      reason: "invalid_definition";
      issues: WorkflowDefinitionValidationIssue[];
    };

export async function activateWorkflow(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  activatedByUserId: string,
): Promise<ActivateWorkflowResult> {
  return withTransaction(pool, async (client) => {
    const draft = await lockDraftWorkflowForActivation(
      client,
      workspaceId,
      workflowId,
    );

    if (draft === null) {
      return {
        activated: false,
        reason: "not_found",
      };
    }

    const validation = validateWorkflowDefinition(draft.draftDefinition);

    if (!validation.valid) {
      return {
        activated: false,
        reason: "invalid_definition",
        issues: validation.issues,
      };
    }

    const currentVersionId = await insertWorkflowVersion(client, {
      workflowId: draft.id,
      versionNumber: 1,
      schemaVersion: validation.definition.schemaVersion,
      definition: validation.definition,
      createdByUserId: activatedByUserId,
    });

    const workflow = await markWorkflowActive(
      client,
      workspaceId,
      workflowId,
      currentVersionId,
    );

    if (workflow === null) {
      throw new Error(
        "Locked draft workflow could not be changed to ACTIVE",
      );
    }

    return {
      activated: true,
      workflow,
      versionNumber: 1,
    };
  });
}