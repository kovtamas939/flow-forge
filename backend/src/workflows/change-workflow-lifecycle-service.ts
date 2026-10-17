import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import {
  lockWorkflowForLifecycleChange,
  updateWorkflowStatus,
  type WorkflowLifecycleDetails,
} from "./workflow-lifecycle-repository.js";
import type { WorkflowStatus } from "./workflow-repository.js";

export type WorkflowLifecycleAction = "disable" | "enable";

export type ChangeWorkflowLifecycleResult =
  | {
      changed: true;
      workflow: WorkflowLifecycleDetails;
    }
  | {
      changed: false;
      reason: "not_found";
    }
  | {
      changed: false;
      reason: "invalid_transition";
      currentStatus: WorkflowStatus;
    };

export async function changeWorkflowLifecycle(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  action: WorkflowLifecycleAction,
): Promise<ChangeWorkflowLifecycleResult> {
  return withTransaction(pool, async (client) => {
    const workflow = await lockWorkflowForLifecycleChange(
      client,
      workspaceId,
      workflowId,
    );

    if (workflow === null) {
      return {
        changed: false,
        reason: "not_found",
      };
    }

    const expectedStatus = action === "disable" ? "ACTIVE" : "DISABLED";
    const newStatus = action === "disable" ? "DISABLED" : "ACTIVE";

    if (workflow.status !== expectedStatus) {
      return {
        changed: false,
        reason: "invalid_transition",
        currentStatus: workflow.status,
      };
    }

    if (newStatus === "ACTIVE" && workflow.currentVersionId === null) {
      throw new Error("Disabled workflow has no current version");
    }

    const updatedWorkflow = await updateWorkflowStatus(
      client,
      workspaceId,
      workflowId,
      expectedStatus,
      newStatus,
    );

    if (updatedWorkflow === null) {
      throw new Error(
        "Locked workflow status could not be changed",
      );
    }

    return {
      changed: true,
      workflow: updatedWorkflow,
    };
  });
}