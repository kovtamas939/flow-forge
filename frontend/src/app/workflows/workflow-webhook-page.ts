import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { API_BASE_URL } from '../api-config';
import { WorkspaceStateService } from '../workspaces/workspace-state.service';
import { WorkflowApiService } from './workflow-api.service';
import { WorkflowMonitoringApiService } from './workflow-monitoring-api.service';
import {
  CreateWorkflowWebhookResponseDto,
  WorkflowWebhookListItemDto,
} from './workflow-monitoring.models';
import { WorkflowDetailResponseDto } from './workflow.models';

@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-workflow-webhook-page',
  styleUrl: './workflow-webhook-page.css',
  templateUrl: './workflow-webhook-page.html',
})
export class WorkflowWebhookPage implements OnInit {
  protected readonly workflow = signal<
    WorkflowDetailResponseDto['workflow'] | null
  >(null);
  protected readonly webhooks = signal<WorkflowWebhookListItemDto[]>([]);
  protected readonly createdWebhook =
    signal<CreateWorkflowWebhookResponseDto | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isLoadingMore = signal(false);
  protected readonly isCreating = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly loadError = signal('');
  protected readonly webhookLoadError = signal('');
  protected readonly createError = signal('');
  protected readonly workspaceId = signal('');

  protected readonly canCreateWebhook = computed(() => {
    const id = this.workspaceId();
    const state = this.workspaceState.state();

    if (id === '' || state.status !== 'loaded') {
      return false;
    }

    return state.workspaces.some(
      (workspace) =>
        workspace.id === id &&
        (workspace.role === 'OWNER' || workspace.role === 'ADMIN'),
    );
  });

  private readonly route = inject(ActivatedRoute);
  private readonly workflowApi = inject(WorkflowApiService);
  private readonly monitoringApi = inject(WorkflowMonitoringApiService);
  private readonly workspaceState = inject(WorkspaceStateService);

  private workflowId = '';
  private nextOffset = 0;
  private readonly pageSize = 20;

  ngOnInit(): void {
    const workspaceId = this.route.snapshot.paramMap.get('workspaceId');
    const workflowId = this.route.snapshot.paramMap.get('workflowId');

    if (workspaceId === null || workflowId === null) {
      this.loadError.set('The workspace or workflow was not specified.');
      this.isLoading.set(false);
      return;
    }

    this.workspaceId.set(workspaceId);
    this.workflowId = workflowId;
    this.loadPage();
  }

  protected loadPage(): void {
    const workspaceId = this.workspaceId();

    if (workspaceId === '') {
      return;
    }

    this.isLoading.set(true);
    this.loadError.set('');
    this.webhookLoadError.set('');

    this.workflowApi.getWorkflow(workspaceId, this.workflowId).subscribe({
      next: (response) => {
        this.workflow.set(response.workflow);
        this.loadFirstWebhookPage();
      },
      error: () => {
        this.loadError.set(
          'Could not load this workflow. Check your workspace access and try again.',
        );
        this.isLoading.set(false);
      },
    });
  }

  protected loadMore(): void {
    const workspaceId = this.workspaceId();

    if (
      workspaceId === '' ||
      this.isLoadingMore() ||
      !this.hasMore()
    ) {
      return;
    }

    this.isLoadingMore.set(true);
    this.webhookLoadError.set('');

    this.monitoringApi
      .listWebhooks(
        workspaceId,
        this.workflowId,
        this.pageSize,
        this.nextOffset,
      )
      .subscribe({
        next: (response) => {
          this.webhooks.update((current) => [
            ...current,
            ...response.webhooks,
          ]);
          this.nextOffset += response.webhooks.length;
          this.hasMore.set(response.pagination.hasMore);
          this.isLoadingMore.set(false);
        },
        error: () => {
          this.webhookLoadError.set(
            'Could not load more webhooks. Please try again.',
          );
          this.isLoadingMore.set(false);
        },
      });
  }

  protected retryLoadMore(): void {
    this.loadMore();
  }

  protected createWebhook(): void {
    const workspaceId = this.workspaceId();

    if (
      workspaceId === '' ||
      !this.canCreateWebhook() ||
      this.isCreating()
    ) {
      return;
    }

    this.isCreating.set(true);
    this.createError.set('');

    this.monitoringApi
      .createWebhook(workspaceId, this.workflowId)
      .subscribe({
        next: (response) => {
          this.createdWebhook.set(response);
          this.isCreating.set(false);
          this.loadPage();
        },
        error: () => {
          this.createError.set(
            'Could not create the webhook. Check your workspace access and try again.',
          );
          this.isCreating.set(false);
        },
      });
  }

  protected dismissSecret(): void {
    this.createdWebhook.set(null);
  }

  protected webhookEndpoint(webhookId: string): string {
    return `${API_BASE_URL}/webhooks/${encodeURIComponent(webhookId)}/events`;
  }

  private loadFirstWebhookPage(): void {
    const workspaceId = this.workspaceId();

    this.monitoringApi
      .listWebhooks(workspaceId, this.workflowId, this.pageSize, 0)
      .subscribe({
        next: (response) => {
          this.webhooks.set(response.webhooks);
          this.nextOffset = response.webhooks.length;
          this.hasMore.set(response.pagination.hasMore);
          this.isLoading.set(false);
        },
        error: () => {
          this.loadError.set(
            'Could not load webhooks. Check your workspace access and try again.',
          );
          this.isLoading.set(false);
        },
      });
  }
}