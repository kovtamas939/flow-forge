import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api-client';
import {
  CreateWorkflowResponseDto,
  WorkflowActivationResponseDto,
  WorkflowDetailResponseDto,
  WorkflowDraftResponseDto,
  WorkflowLifecycleResponseDto,
  WorkflowListResponseDto,
} from './workflow.models';

@Injectable({
  providedIn: 'root',
})
export class WorkflowApiService {
  private readonly apiClient = inject(ApiClient);

  listWorkflows(
    workspaceId: string,
    limit = 20,
    offset = 0,
  ): Observable<WorkflowListResponseDto> {
    const encodedWorkspaceId = encodeURIComponent(workspaceId);
    const path =
      `workspaces/${encodedWorkspaceId}/workflows` +
      `?limit=${limit}&offset=${offset}`;

    return this.apiClient.get<WorkflowListResponseDto>(path);
  }

  createWorkflow(
    workspaceId: string,
    name: string,
  ): Observable<CreateWorkflowResponseDto> {
    const encodedWorkspaceId = encodeURIComponent(workspaceId);

    return this.apiClient.post<
      { name: string },
      CreateWorkflowResponseDto
    >(`workspaces/${encodedWorkspaceId}/workflows`, { name });
  }

  getWorkflow(
    workspaceId: string,
    workflowId: string,
  ): Observable<WorkflowDetailResponseDto> {
    const encodedWorkspaceId = encodeURIComponent(workspaceId);
    const encodedWorkflowId = encodeURIComponent(workflowId);

    return this.apiClient.get<WorkflowDetailResponseDto>(
      `workspaces/${encodedWorkspaceId}/workflows/${encodedWorkflowId}`,
    );
  }

  replaceDraftDefinition(
    workspaceId: string,
    workflowId: string,
    definition: unknown,
  ): Observable<WorkflowDraftResponseDto> {
    const encodedWorkspaceId = encodeURIComponent(workspaceId);
    const encodedWorkflowId = encodeURIComponent(workflowId);

    return this.apiClient.put<
      { definition: unknown },
      WorkflowDraftResponseDto
    >(
      `workspaces/${encodedWorkspaceId}/workflows/${encodedWorkflowId}/draft`,
      { definition },
    );
  }

  activateWorkflow(
    workspaceId: string,
    workflowId: string,
  ): Observable<WorkflowActivationResponseDto> {
    const encodedWorkspaceId = encodeURIComponent(workspaceId);
    const encodedWorkflowId = encodeURIComponent(workflowId);

    return this.apiClient.put<
      Record<string, never>,
      WorkflowActivationResponseDto
    >(
      `workspaces/${encodedWorkspaceId}/workflows/${encodedWorkflowId}/activate`,
      {},
    );
  }

  disableWorkflow(
    workspaceId: string,
    workflowId: string,
  ): Observable<WorkflowLifecycleResponseDto> {
    const encodedWorkspaceId = encodeURIComponent(workspaceId);
    const encodedWorkflowId = encodeURIComponent(workflowId);

    return this.apiClient.post<
      Record<string, never>,
      WorkflowLifecycleResponseDto
    >(
      `workspaces/${encodedWorkspaceId}/workflows/${encodedWorkflowId}/disable`,
      {},
    );
  }

  enableWorkflow(
    workspaceId: string,
    workflowId: string,
  ): Observable<WorkflowLifecycleResponseDto> {
    const encodedWorkspaceId = encodeURIComponent(workspaceId);
    const encodedWorkflowId = encodeURIComponent(workflowId);

    return this.apiClient.post<
      Record<string, never>,
      WorkflowLifecycleResponseDto
    >(
      `workspaces/${encodedWorkspaceId}/workflows/${encodedWorkflowId}/enable`,
      {},
    );
  }
}