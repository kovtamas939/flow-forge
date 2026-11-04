import { inject, Injectable, signal } from '@angular/core';
import { WorkspaceApiService } from './workspace-api.service';
import { UserWorkspaceDto } from './workspace.models';

export type WorkspaceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'loaded';
      workspaces: UserWorkspaceDto[];
      selectedWorkspaceId: string | null;
    }
  | { status: 'error' };

@Injectable({
  providedIn: 'root',
})
export class WorkspaceStateService {
  private readonly workspaceApi = inject(WorkspaceApiService);
  private readonly stateSignal = signal<WorkspaceState>({ status: 'idle' });

  readonly state = this.stateSignal.asReadonly();

  loadMyWorkspaces(): void {
    const currentState = this.stateSignal();

    if (currentState.status === 'loading' || currentState.status === 'loaded') {
      return;
    }

    this.stateSignal.set({ status: 'loading' });

    this.workspaceApi.listMyWorkspaces().subscribe({
      next: (response) => {
        this.stateSignal.set({
          status: 'loaded',
          workspaces: response.workspaces,
          selectedWorkspaceId:
            response.workspaces.length === 1
              ? response.workspaces[0].id
              : null,
        });
      },
      error: () => {
        this.stateSignal.set({ status: 'error' });
      },
    });
  }

  selectWorkspace(workspaceId: string): void {
    const currentState = this.stateSignal();

    if (currentState.status !== 'loaded') {
      return;
    }

    const belongsToUser = currentState.workspaces.some(
      (workspace) => workspace.id === workspaceId,
    );

    if (!belongsToUser) {
      return;
    }

    this.stateSignal.set({
      ...currentState,
      selectedWorkspaceId: workspaceId,
    });
  }

  reset(): void {
    this.stateSignal.set({ status: 'idle' });
  }
}