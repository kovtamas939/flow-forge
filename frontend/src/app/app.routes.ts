import { Routes } from '@angular/router';
import { WorkflowDraftPage } from './workflows/workflow-draft-page';
import { WorkflowListPage } from './workflows/workflow-list-page';

export const routes: Routes = [
  {
    path: 'workspaces/:workspaceId/workflows',
    component: WorkflowListPage,
  },
  {
    path: 'workspaces/:workspaceId/workflows/:workflowId/edit',
    component: WorkflowDraftPage,
  },
];