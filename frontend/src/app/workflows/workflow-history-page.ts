import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { WorkflowMonitoringApiService } from './workflow-monitoring-api.service';
import {
  WorkflowExecutionDto,
  WorkflowEventDto,
} from './workflow-monitoring.models';
import { WorkflowApiService } from './workflow-api.service';
import { WorkflowDetailResponseDto } from './workflow.models';

@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-workflow-history-page',
  styleUrl: './workflow-history-page.css',
  templateUrl: './workflow-history-page.html',
})
export class WorkflowHistoryPage implements OnInit {
  protected readonly workflow = signal<
    WorkflowDetailResponseDto['workflow'] | null
  >(null);
  protected readonly events = signal<WorkflowEventDto[]>([]);
  protected readonly executions = signal<WorkflowExecutionDto[]>([]);

  protected readonly isLoadingWorkflow = signal(true);
  protected readonly isLoadingEvents = signal(false);
  protected readonly isLoadingExecutions = signal(false);
  protected readonly hasMoreEvents = signal(false);
  protected readonly hasMoreExecutions = signal(false);

  protected readonly workflowError = signal('');
  protected readonly eventsError = signal('');
  protected readonly executionsError = signal('');
  protected readonly workspaceId = signal('');

  private readonly route = inject(ActivatedRoute);
  private readonly workflowApi = inject(WorkflowApiService);
  private readonly monitoringApi = inject(WorkflowMonitoringApiService);

  private workflowId = '';
  private eventOffset = 0;
  private executionOffset = 0;
  private readonly pageSize = 20;

  ngOnInit(): void {
    const workspaceId = this.route.snapshot.paramMap.get('workspaceId');
    const workflowId = this.route.snapshot.paramMap.get('workflowId');

    if (workspaceId === null || workflowId === null) {
      this.workflowError.set('The workspace or workflow was not specified.');
      this.isLoadingWorkflow.set(false);
      return;
    }

    this.workspaceId.set(workspaceId);
    this.workflowId = workflowId;
    this.loadWorkflow();
  }

  protected loadWorkflow(): void {
    const workspaceId = this.workspaceId();

    if (workspaceId === '') {
      return;
    }

    this.isLoadingWorkflow.set(true);
    this.workflowError.set('');

    this.workflowApi.getWorkflow(workspaceId, this.workflowId).subscribe({
      next: (response) => {
        this.workflow.set(response.workflow);
        this.isLoadingWorkflow.set(false);

        this.loadEvents();
        this.loadExecutions();
      },
      error: () => {
        this.workflowError.set(
          'Could not load this workflow. Check your workspace access and try again.',
        );
        this.isLoadingWorkflow.set(false);
      },
    });
  }

  protected loadEvents(): void {
    const workspaceId = this.workspaceId();

    if (workspaceId === '' || this.isLoadingEvents()) {
      return;
    }

    this.isLoadingEvents.set(true);
    this.eventsError.set('');

    this.monitoringApi
      .listEvents(
        workspaceId,
        this.workflowId,
        this.pageSize,
        this.eventOffset,
      )
      .subscribe({
        next: (response) => {
          this.events.update((current) => [
            ...current,
            ...response.events,
          ]);
          this.eventOffset += response.events.length;
          this.hasMoreEvents.set(response.pagination.hasMore);
          this.isLoadingEvents.set(false);
        },
        error: () => {
          this.eventsError.set(
            'Could not load events. Check your workspace access and try again.',
          );
          this.isLoadingEvents.set(false);
        },
      });
  }

  protected loadExecutions(): void {
    const workspaceId = this.workspaceId();

    if (workspaceId === '' || this.isLoadingExecutions()) {
      return;
    }

    this.isLoadingExecutions.set(true);
    this.executionsError.set('');

    this.monitoringApi
      .listExecutions(
        workspaceId,
        this.workflowId,
        this.pageSize,
        this.executionOffset,
      )
      .subscribe({
        next: (response) => {
          this.executions.update((current) => [
            ...current,
            ...response.executions,
          ]);
          this.executionOffset += response.executions.length;
          this.hasMoreExecutions.set(response.pagination.hasMore);
          this.isLoadingExecutions.set(false);
        },
        error: () => {
          this.executionsError.set(
            'Could not load executions. Check your workspace access and try again.',
          );
          this.isLoadingExecutions.set(false);
        },
      });
  }

  protected eventStatusLabel(event: WorkflowEventDto): string {
    return event.executionStatus ?? 'Waiting for execution';
  }
}