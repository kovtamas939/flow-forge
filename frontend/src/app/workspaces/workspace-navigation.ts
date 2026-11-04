import { WorkspaceRole } from './workspace.models';

export type WorkspaceNavigationItem = {
  label: string;
};

export function getWorkspaceNavigationItems(
  role: WorkspaceRole,
): WorkspaceNavigationItem[] {
  const items: WorkspaceNavigationItem[] = [
    { label: 'Workflows' },
  ];

  if (role === 'OWNER' || role === 'ADMIN') {
    items.push(
      { label: 'Create and edit workflows' },
      { label: 'Activate workflows' },
    );
  }

  return items;
}