import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api-client';
import {
  CreateWorkflowWebhookResponseDto,
  WorkflowExecutionsResponseDto,
  WorkflowEventsResponseDto,
  WorkflowWebhooksResponseDto,
} from './workflow-monitoring.models';

@Injectable({
  providedIn: 'root',
})
export class WorkflowMonitoringApiService {
  private readonly apiClient = inject(ApiClient);

  listWebhooks(
    workspaceId: string,
    workflowId: string,
    limit = 20,
    offset = 0,
  ): Observable<WorkflowWebhooksResponseDto> {
    const path =
      `${this.workflowPath(workspaceId, workflowId)}/webhooks` +
      `?limit=${limit}&offset=${offset}`;

    return this.apiClient.get<WorkflowWebhooksResponseDto>(path);
  }

  createWebhook(
    workspaceId: string,
    workflowId: string,
  ): Observable<CreateWorkflowWebhookResponseDto> {
    const path = `${this.workflowPath(workspaceId, workflowId)}/webhooks`;

    return this.apiClient.post<
      Record<string, never>,
      CreateWorkflowWebhookResponseDto
    >(path, {});
  }

  listEvents(
    workspaceId: string,
    workflowId: string,
    limit = 20,
    offset = 0,
  ): Observable<WorkflowEventsResponseDto> {
    const path =
      `${this.workflowPath(workspaceId, workflowId)}/events` +
      `?limit=${limit}&offset=${offset}`;

    return this.apiClient.get<WorkflowEventsResponseDto>(path);
  }

  listExecutions(
    workspaceId: string,
    workflowId: string,
    limit = 20,
    offset = 0,
  ): Observable<WorkflowExecutionsResponseDto> {
    const path =
      `${this.workflowPath(workspaceId, workflowId)}/executions` +
      `?limit=${limit}&offset=${offset}`;

    return this.apiClient.get<WorkflowExecutionsResponseDto>(path);
  }

  private workflowPath(
    workspaceId: string,
    workflowId: string,
  ): string {
    const encodedWorkspaceId = encodeURIComponent(workspaceId);
    const encodedWorkflowId = encodeURIComponent(workflowId);

    return (
      `workspaces/${encodedWorkspaceId}` +
      `/workflows/${encodedWorkflowId}`
    );
  }
}