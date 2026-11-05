import type { Pool } from "pg";
import {
  listWebhooksForWorkflow,
  type WorkflowWebhookListResult,
} from "./webhook-list-repository.js";

export async function listWorkflowWebhooks(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  limit: number,
  offset: number,
): Promise<WorkflowWebhookListResult> {
  return listWebhooksForWorkflow(
    pool,
    workspaceId,
    workflowId,
    limit,
    offset,
  );
}