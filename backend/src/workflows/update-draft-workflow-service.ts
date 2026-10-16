import type { Pool } from "pg";
import {
  updateDraftWorkflowDefinition,
  type DraftWorkflow,
} from "./workflow-repository.js";

export class DraftWorkflowInputError extends Error {
  public readonly code = "VALIDATION_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "DraftWorkflowInputError";
  }
}

export async function replaceDraftWorkflowDefinition(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  requestBody: unknown,
): Promise<DraftWorkflow | null> {
  if (
    typeof requestBody !== "object" ||
    requestBody === null ||
    Array.isArray(requestBody)
  ) {
    throw new DraftWorkflowInputError("Request body must be an object");
  }

  if (!Object.hasOwn(requestBody, "definition")) {
    throw new DraftWorkflowInputError(
      "Request body must include a definition field",
    );
  }

  const definition = (requestBody as Record<string, unknown>).definition;

  if (definition === undefined) {
    throw new DraftWorkflowInputError(
      "Definition must be a JSON value",
    );
  }

  return updateDraftWorkflowDefinition(pool, {
    workspaceId,
    workflowId,
    definition,
  });
}