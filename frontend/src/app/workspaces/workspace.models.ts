export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type UserWorkspaceDto = {
  id: string;
  name: string;
  role: WorkspaceRole;
  createdAt: string;
};

export type UserWorkspacesResponseDto = {
  workspaces: UserWorkspaceDto[];
};