import type { Pool } from "pg";
import {
  findWorkspacesForUser,
  type UserWorkspace,
} from "./workspace-membership-repository.js";

export async function listWorkspacesForUser(
  pool: Pool,
  userId: string,
): Promise<UserWorkspace[]> {
  return findWorkspacesForUser(pool, userId);
}