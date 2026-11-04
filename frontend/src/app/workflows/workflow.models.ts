export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED';

export type WorkflowListItemDto = {
  id: string;
  workspaceId: string;
  name: string;
  status: WorkflowStatus;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowPaginationDto = {
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type WorkflowListResponseDto = {
  workflows: WorkflowListItemDto[];
  pagination: WorkflowPaginationDto;
};

export type CreateWorkflowResponseDto = {
  workflow: {
    id: string;
    workspaceId: string;
    name: string;
    status: 'DRAFT';
    createdAt: string;
    updatedAt: string;
  };
};

export type WorkflowDetailResponseDto = {
  workflow: WorkflowListItemDto & {
    draftDefinition: unknown;
    currentVersion: {
      id: string;
      versionNumber: number;
      schemaVersion: number;
      definition: unknown;
      createdAt: string;
    } | null;
  };
};

export type WorkflowDraftResponseDto = {
  workflow: {
    id: string;
    workspaceId: string;
    name: string;
    status: 'DRAFT';
    draftDefinition: unknown;
    updatedAt: string;
  };
};

export type WorkflowLifecycleResponseDto = {
  workflow: WorkflowListItemDto;
};

export type WorkflowActivationResponseDto = {
  workflow: Omit<WorkflowListItemDto, 'currentVersionId'>;
  versionNumber: number;
};