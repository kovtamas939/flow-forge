import type { PoolClient } from "pg";

export type AuditAction =
  | "WORKSPACE_CREATED"
  | "WORKSPACE_OWNER_MEMBERSHIP_CREATED";

export type AuditTargetType = "workspace" | "workspace_membership";

export type CreateAuditLogInput = {
  workspaceId: string;
  actorUserId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  metadata: Record<string, string>;
};

export async function insertAuditLog(
  client: PoolClient,
  input: CreateAuditLogInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO audit_logs (
        workspace_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.workspaceId,
      input.actorUserId,
      input.action,
      input.targetType,
      input.targetId,
      JSON.stringify(input.metadata),
    ],
  );
}