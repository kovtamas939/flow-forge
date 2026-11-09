import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { WorkspaceStateService } from '../workspaces/workspace-state.service';
import { WorkflowApiService } from './workflow-api.service';
import { WorkflowListItemDto } from './workflow.models';

@Component({
  imports: [DatePipe, FormsModule, RouterLink],
  selector: 'app-workflow-list-page',
  styleUrl: './workflow-list-page.css',
  templateUrl: './workflow-list-page.html',
})
export class WorkflowListPage implements OnInit {
  protected readonly workflows = signal<WorkflowListItemDto[]>([]);
  protected readonly hasMore = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly loadError = signal('');
  protected readonly newWorkflowName = signal('');
  protected readonly isCreating = signal(false);
  protected readonly createError = signal('');
  protected readonly showCreateForm = signal(false);
  protected readonly workspaceId = signal('');
  protected readonly actionInProgressId = signal<string | null>(null);
  protected readonly actionError = signal('');

  protected readonly canWriteWorkflows = computed(() => {
    const id = this.workspaceId();
    const state = this.workspaceState.state();

    return (
      id !== '' &&
      state.status === 'loaded' &&
      state.workspaces.some(
        (workspace) =>
          workspace.id === id &&
          (workspace.role === 'OWNER' || workspace.role === 'ADMIN'),
      )
    );
  });

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workflowApi = inject(WorkflowApiService);
  private readonly workspaceState = inject(WorkspaceStateService);
  private readonly destroyRef = inject(DestroyRef);
  private pageSize = 20;
  private nextOffset = 0;
  private requestGeneration = 0;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map((params) => params.get('workspaceId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((workspaceId) => {
        this.resetWorkflowList();

        if (workspaceId === null) {
          this.loadError.set('A workspace was not specified.');
          return;
        }

        this.workspaceId.set(workspaceId);
        this.pageSize = this.readQueryNumber('limit', 20, 1, 100);
        this.nextOffset = this.readQueryNumber('offset', 0, 0);

        this.loadNextPage();
      });
  }

  protected loadNextPage(): void {
    const workspaceId = this.workspaceId();

    if (
      workspaceId === '' ||
      this.isLoading() ||
      !this.hasMoreOrFirstPage()
    ) {
      return;
    }

    const requestGeneration = this.requestGeneration;

    this.isLoading.set(true);
    this.loadError.set('');

    this.workflowApi
      .listWorkflows(workspaceId, this.pageSize, this.nextOffset)
      .subscribe({
        next: (response) => {
          if (requestGeneration !== this.requestGeneration) {
            return;
          }

          this.workflows.update((current) => [
            ...current,
            ...response.workflows,
          ]);
          this.nextOffset += response.workflows.length;
          this.hasMore.set(response.pagination.hasMore);
          this.isLoading.set(false);
        },
        error: () => {
          if (requestGeneration !== this.requestGeneration) {
            return;
          }

          this.loadError.set(
            'Could not load workflows. Check your workspace access and try again.',
          );
          this.isLoading.set(false);
        },
      });
  }

  protected retry(): void {
    this.loadNextPage();
  }

  protected createWorkflow(): void {
    const workspaceId = this.workspaceId();
    const name = this.newWorkflowName().trim();

    if (
      !this.canWriteWorkflows() ||
      workspaceId === '' ||
      name.length === 0 ||
      this.isCreating()
    ) {
      return;
    }

    this.isCreating.set(true);
    this.createError.set('');

    this.workflowApi.createWorkflow(workspaceId, name).subscribe({
      next: (response) => {
        void this.router.navigate([
          '/workspaces',
          workspaceId,
          'workflows',
          response.workflow.id,
          'edit',
        ]);
      },
      error: () => {
        this.createError.set(
          'Could not create the workflow. Check your workspace access and try again.',
        );
        this.isCreating.set(false);
      },
    });
  }

  protected toggleCreateForm(): void {
    this.showCreateForm.update((visible) => !visible);
    this.createError.set('');
  }

  protected changeWorkflowStatus(workflow: WorkflowListItemDto): void {
    const workspaceId = this.workspaceId();

    if (
      !this.canWriteWorkflows() ||
      workspaceId === '' ||
      this.actionInProgressId() !== null
    ) {
      return;
    }

    this.actionInProgressId.set(workflow.id);
    this.actionError.set('');

    if (workflow.status === 'DRAFT') {
      this.workflowApi.activateWorkflow(workspaceId, workflow.id).subscribe({
        next: (response) => {
          this.applyWorkflowUpdate(response.workflow);
        },
        error: () => {
          this.handleWorkflowActionError(workflow);
        },
      });

      return;
    }

    const request =
      workflow.status === 'ACTIVE'
        ? this.workflowApi.disableWorkflow(workspaceId, workflow.id)
        : this.workflowApi.enableWorkflow(workspaceId, workflow.id);

    request.subscribe({
      next: (response) => {
        this.applyWorkflowUpdate(response.workflow);
      },
      error: () => {
        this.handleWorkflowActionError(workflow);
      },
    });
  }

  protected lifecycleButtonLabel(status: WorkflowListItemDto['status']): string {
    switch (status) {
      case 'DRAFT':
        return 'Activate';
      case 'ACTIVE':
        return 'Disable';
      case 'DISABLED':
        return 'Enable';
    }
  }

  private resetWorkflowList(): void {
    this.requestGeneration += 1;
    this.workflows.set([]);
    this.hasMore.set(false);
    this.isLoading.set(false);
    this.loadError.set('');
    this.actionInProgressId.set(null);
    this.actionError.set('');
    this.nextOffset = 0;
  }

  private applyWorkflowUpdate(updatedWorkflow: {
    id: string;
    status: WorkflowListItemDto['status'];
    updatedAt: string;
    currentVersionId?: string | null;
  }): void {
    this.workflows.update((current) =>
      current.map((item) => {
        if (item.id !== updatedWorkflow.id) {
          return item;
        }

        return {
          ...item,
          status: updatedWorkflow.status,
          currentVersionId:
            updatedWorkflow.currentVersionId === undefined
              ? item.currentVersionId
              : updatedWorkflow.currentVersionId,
          updatedAt: updatedWorkflow.updatedAt,
        };
      }),
    );

    this.actionInProgressId.set(null);
  }

  private handleWorkflowActionError(workflow: WorkflowListItemDto): void {
    this.actionError.set(
      workflow.status === 'DRAFT'
        ? 'Could not activate this workflow. Check the draft definition; it may be invalid.'
        : 'Could not change this workflow status. Check your workspace access and try again.',
    );
    this.actionInProgressId.set(null);
  }

  private readQueryNumber(
    name: string,
    fallback: number,
    minimum: number,
    maximum = Number.MAX_SAFE_INTEGER,
  ): number {
    const value = this.route.snapshot.queryParamMap.get(name);

    if (value === null || !/^\d+$/.test(value)) {
      return fallback;
    }

    const parsed = Number(value);

    return Number.isSafeInteger(parsed) &&
      parsed >= minimum &&
      parsed <= maximum
      ? parsed
      : fallback;
  }

  private hasMoreOrFirstPage(): boolean {
    return this.workflows().length === 0 || this.hasMore();
  }
}