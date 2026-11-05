import type { Pool } from "pg";
import {
  listEventsForWorkflow,
  type WorkflowEventListResult,
} from "./event-list-repository.js";

export async function listWorkflowEvents(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  limit: number,
  offset: number,
): Promise<WorkflowEventListResult> {
  return listEventsForWorkflow(
    pool,
    workspaceId,
    workflowId,
    limit,
    offset,
  );
}