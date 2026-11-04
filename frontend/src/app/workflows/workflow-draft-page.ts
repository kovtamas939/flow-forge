import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { WorkflowApiService } from './workflow-api.service';
import { WorkflowDetailResponseDto } from './workflow.models';

const INITIAL_WORKFLOW_DEFINITION = {
  schemaVersion: 1,
  trigger: {
    type: 'webhook',
  },
  actions: [
    {
      id: 'log-action-1',
      type: 'log',
      message: 'Workflow executed',
    },
  ],
};

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-workflow-draft-page',
  styleUrl: './workflow-draft-page.css',
  templateUrl: './workflow-draft-page.html',
})
export class WorkflowDraftPage implements OnInit {
  protected readonly workflow = signal<
    WorkflowDetailResponseDto['workflow'] | null
  >(null);
  protected readonly definitionText = signal('');
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly loadError = signal('');
  protected readonly saveError = signal('');
  protected readonly saveSuccess = signal('');

  private readonly route = inject(ActivatedRoute);
  private readonly workflowApi = inject(WorkflowApiService);
  private workspaceId = '';
  private workflowId = '';

  ngOnInit(): void {
    const workspaceId = this.route.snapshot.paramMap.get('workspaceId');
    const workflowId = this.route.snapshot.paramMap.get('workflowId');

    if (workspaceId === null || workflowId === null) {
      this.loadError.set('The workspace or workflow was not specified.');
      this.isLoading.set(false);
      return;
    }

    this.workspaceId = workspaceId;
    this.workflowId = workflowId;

    this.workflowApi.getWorkflow(workspaceId, workflowId).subscribe({
      next: (response) => {
        this.workflow.set(response.workflow);

        const definition =
          response.workflow.draftDefinition ?? INITIAL_WORKFLOW_DEFINITION;

        this.definitionText.set(JSON.stringify(definition, null, 2));
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set(
          'Could not load this workflow. Check your workspace access and try again.',
        );
        this.isLoading.set(false);
      },
    });
  }

  protected saveDraft(): void {
    const workflow = this.workflow();

    if (
      workflow === null ||
      workflow.status !== 'DRAFT' ||
      this.isSaving()
    ) {
      return;
    }

    this.saveError.set('');
    this.saveSuccess.set('');

    let definition: unknown;

    try {
      definition = JSON.parse(this.definitionText());
    } catch {
      this.saveError.set('The definition is not valid JSON.');
      return;
    }

    if (
      typeof definition !== 'object' ||
      definition === null ||
      Array.isArray(definition)
    ) {
      this.saveError.set('The workflow definition must be a JSON object.');
      return;
    }

    this.isSaving.set(true);

    this.workflowApi
      .replaceDraftDefinition(this.workspaceId, this.workflowId, definition)
      .subscribe({
        next: (response) => {
          this.workflow.update((current) =>
            current === null
              ? current
              : {
                  ...current,
                  draftDefinition: response.workflow.draftDefinition,
                  updatedAt: response.workflow.updatedAt,
                },
          );
          this.saveSuccess.set('Draft saved.');
          this.isSaving.set(false);
        },
        error: () => {
          this.saveError.set(
            'Could not save the draft. Check your workspace access and definition.',
          );
          this.isSaving.set(false);
        },
      });
  }
}