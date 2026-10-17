import type { Pool } from "pg";
import {
  findWorkflowDetail,
  type WorkflowDetail,
} from "./workflow-detail-repository.js";

export async function getWorkflowDetail(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
): Promise<WorkflowDetail | null> {
  return findWorkflowDetail(pool, workspaceId, workflowId);
}