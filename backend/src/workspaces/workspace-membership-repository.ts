import type { Pool } from "pg";
import {
  isWorkspaceRole,
  type WorkspaceRole,
} from "./workspace-policy.js";

export type UserWorkspace = {
  id: string;
  name: string;
  role: WorkspaceRole;
  createdAt: Date;
};

type UserWorkspaceRow = {
  id: string;
  name: string;
  role: string;
  created_at: Date;
};

function mapUserWorkspaceRow(row: UserWorkspaceRow): UserWorkspace {
  if (!isWorkspaceRole(row.role)) {
    throw new Error(`Unexpected workspace role "${row.role}"`);
  }

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function findWorkspacesForUser(
  pool: Pool,
  userId: string,
): Promise<UserWorkspace[]> {
  const result = await pool.query<UserWorkspaceRow>(
    `
      SELECT
        workspaces.id,
        workspaces.name,
        workspace_memberships.role,
        workspaces.created_at
      FROM workspace_memberships
      INNER JOIN workspaces
        ON workspaces.id = workspace_memberships.workspace_id
      WHERE workspace_memberships.user_id = $1
      ORDER BY workspaces.name ASC, workspaces.id ASC
    `,
    [userId],
  );

  return result.rows.map(mapUserWorkspaceRow);
}