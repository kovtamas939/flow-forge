import type { Pool } from "pg";
import {
  insertDraftWorkflow,
  type Workflow,
} from "./workflow-repository.js";

export class WorkflowInputError extends Error {
  public readonly code = "VALIDATION_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "WorkflowInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateWorkflowName(value: unknown): string {
  if (!isRecord(value)) {
    throw new WorkflowInputError("Request body must be an object");
  }

  if (typeof value.name !== "string") {
    throw new WorkflowInputError("Workflow name must be a string");
  }

  const name = value.name.trim();
  const nameLength = [...name].length;

  if (nameLength < 1 || nameLength > 120) {
    throw new WorkflowInputError(
      "Workflow name must contain between 1 and 120 characters",
    );
  }

  return name;
}

export async function createDraftWorkflow(
  pool: Pool,
  workspaceId: string,
  createdByUserId: string,
  requestBody: unknown,
): Promise<Workflow> {
  const name = validateWorkflowName(requestBody);

  return insertDraftWorkflow(pool, {
    workspaceId,
    name,
    createdByUserId,
  });
}