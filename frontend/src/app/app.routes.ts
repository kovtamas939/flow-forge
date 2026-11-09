import { Routes } from '@angular/router';
import { SignedOutPlaceholderPage } from './signed-out-placeholder-page';
import { WorkflowDraftPage } from './workflows/workflow-draft-page';
import { WorkflowHistoryPage } from './workflows/workflow-history-page';
import { WorkflowListPage } from './workflows/workflow-list-page';
import { WorkflowWebhookPage } from './workflows/workflow-webhook-page';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: SignedOutPlaceholderPage,
  },
  {
    path: 'workspaces/:workspaceId/workflows',
    component: WorkflowListPage,
  },
  {
    path: 'workspaces/:workspaceId/workflows/:workflowId/edit',
    component: WorkflowDraftPage,
  },
  {
    path: 'workspaces/:workspaceId/workflows/:workflowId/webhooks',
    component: WorkflowWebhookPage,
  },
  {
    path: 'workspaces/:workspaceId/workflows/:workflowId/history',
    component: WorkflowHistoryPage,
  },
];