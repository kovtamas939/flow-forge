export type HistoryPaginationDto = {
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type WorkflowWebhookListItemDto = {
  id: string;
  workspaceId: string;
  workflowId: string;
  isEnabled: boolean;
  secretVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowWebhooksResponseDto = {
  webhooks: WorkflowWebhookListItemDto[];
  pagination: HistoryPaginationDto;
};

export type CreateWorkflowWebhookResponseDto = {
  webhook: {
    id: string;
    workspaceId: string;
    workflowId: string;
    isEnabled: boolean;
    secretVersion: number;
    createdAt: string;
  };
  secret: string;
};

export type WorkflowEventExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'RETRY_PENDING'
  | 'COMPLETED'
  | 'FAILED';

export type WorkflowEventDto = {
  id: string;
  webhookId: string;
  externalEventId: string;
  receivedAt: string;
  executionId: string | null;
  executionStatus: WorkflowEventExecutionStatus | null;
};

export type WorkflowEventsResponseDto = {
  events: WorkflowEventDto[];
  pagination: HistoryPaginationDto;
};

export type WorkflowExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'RETRY_PENDING'
  | 'COMPLETED'
  | 'FAILED';

export type WorkflowExecutionDto = {
  id: string;
  eventId: string;
  workflowVersionId: string;
  status: WorkflowExecutionStatus;
  attemptCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  lastErrorCode: string | null;
};

export type WorkflowExecutionsResponseDto = {
  executions: WorkflowExecutionDto[];
  pagination: HistoryPaginationDto;
};