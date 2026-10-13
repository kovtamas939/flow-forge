import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import {
  insertWorkspace,
  insertWorkspaceOwnerMembership,
  type Workspace,
} from "./workspace-repository.js";

export class WorkspaceInputError extends Error {
  public readonly code = "VALIDATION_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "WorkspaceInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateWorkspaceName(value: unknown): string {
  if (!isRecord(value)) {
    throw new WorkspaceInputError("Request body must be an object");
  }

  if (typeof value.name !== "string") {
    throw new WorkspaceInputError("Workspace name must be a string");
  }

  const name = value.name.trim();
  const nameLength = [...name].length;

  if (nameLength < 1 || nameLength > 120) {
    throw new WorkspaceInputError(
      "Workspace name must contain between 1 and 120 characters",
    );
  }

  return name;
}

export async function createWorkspace(
  pool: Pool,
  ownerUserId: string,
  requestBody: unknown,
): Promise<Workspace> {
  const name = validateWorkspaceName(requestBody);

  return withTransaction(pool, async (client) => {
    const workspace = await insertWorkspace(client, name);

    await insertWorkspaceOwnerMembership(
      client,
      workspace.id,
      ownerUserId,
    );

    return workspace;
  });
}