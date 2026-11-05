import type { Pool } from "pg";
import {
  listExecutionsForWorkflow,
  type WorkflowExecutionListResult,
} from "./execution-list-repository.js";

export async function listWorkflowExecutions(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  limit: number,
  offset: number,
): Promise<WorkflowExecutionListResult> {
  return listExecutionsForWorkflow(
    pool,
    workspaceId,
    workflowId,
    limit,
    offset,
  );
}