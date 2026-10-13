import type { PoolClient } from "pg";

export type Workspace = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type WorkspaceRow = {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
};

function mapWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertWorkspace(
  client: PoolClient,
  name: string,
): Promise<Workspace> {
  const result = await client.query<WorkspaceRow>(
    `
      INSERT INTO workspaces (name)
      VALUES ($1)
      RETURNING
        id,
        name,
        created_at,
        updated_at
    `,
    [name],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("Workspace insert did not return a row");
  }

  return mapWorkspaceRow(row);
}

export async function insertWorkspaceOwnerMembership(
  client: PoolClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await client.query(
    `
      INSERT INTO workspace_memberships (
        workspace_id,
        user_id,
        role
      )
      VALUES ($1, $2, 'OWNER')
    `,
    [workspaceId, userId],
  );
}