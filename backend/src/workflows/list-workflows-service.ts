import type { Pool } from "pg";
import {
  listWorkflowsForWorkspace,
  type WorkflowPage,
} from "./workflow-list-repository.js";

export async function listWorkflows(
  pool: Pool,
  workspaceId: string,
  limit: number,
  offset: number,
): Promise<WorkflowPage> {
  return listWorkflowsForWorkspace(pool, workspaceId, limit, offset);
}