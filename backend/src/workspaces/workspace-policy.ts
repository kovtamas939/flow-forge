export const WORKSPACE_ROLES = [
  "OWNER",
  "ADMIN",
  "MEMBER",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type WorkspacePermission =
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "members:read"
  | "members:manage"
  | "workflows:read"
  | "workflows:write"
  | "workflows:activate";

const ROLE_PERMISSIONS = {
  OWNER: [
    "workspace:read",
    "workspace:update",
    "workspace:delete",
    "members:read",
    "members:manage",
    "workflows:read",
    "workflows:write",
    "workflows:activate",
  ],
  ADMIN: [
    "workspace:read",
    "workspace:update",
    "members:read",
    "members:manage",
    "workflows:read",
    "workflows:write",
    "workflows:activate",
  ],
  MEMBER: [
    "workspace:read",
    "members:read",
    "workflows:read",
  ],
} as const satisfies Record<WorkspaceRole, readonly WorkspacePermission[]>;

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    WORKSPACE_ROLES.some((role) => role === value)
  );
}

export function hasWorkspacePermission(
  role: unknown,
  permission: WorkspacePermission,
): boolean {
  if (!isWorkspaceRole(role)) {
    return false;
  }

  const permissions: readonly WorkspacePermission[] = ROLE_PERMISSIONS[role];

  return permissions.includes(permission);
}