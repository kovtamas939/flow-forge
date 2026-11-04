import { WorkspaceRole } from './workspace.models';

export type WorkspaceNavigationItem = {
  label: string;
  path: string | null;
};

export function getWorkspaceNavigationItems(
  role: WorkspaceRole,
  workspaceId: string,
): WorkspaceNavigationItem[] {
  const workflowsPath =
    `/workspaces/${encodeURIComponent(workspaceId)}/workflows`;

  const items: WorkspaceNavigationItem[] = [
    {
      label: 'Workflows',
      path: workflowsPath,
    },
  ];

  if (role === 'OWNER' || role === 'ADMIN') {
    items.push(
      { label: 'Create and edit workflows', path: workflowsPath },
      { label: 'Activate workflows', path: workflowsPath },
    );
  }

  return items;
}