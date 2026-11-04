import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthApiService } from './auth/auth-api.service';
import { AuthStateService } from './auth/auth-state.service';
import { getWorkspaceNavigationItems } from './workspaces/workspace-navigation';
import { WorkspaceStateService } from './workspaces/workspace-state.service';

@Component({
  imports: [FormsModule, RouterLink, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly authState = inject(AuthStateService);
  protected readonly workspaceState = inject(WorkspaceStateService);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly loginError = signal('');

  protected readonly selectedWorkspace = computed(() => {
    const state = this.workspaceState.state();

    if (
      state.status !== 'loaded' ||
      state.selectedWorkspaceId === null
    ) {
      return null;
    }

    return (
      state.workspaces.find(
        (workspace) => workspace.id === state.selectedWorkspaceId,
      ) ?? null
    );
  });

  protected readonly navigationItems = computed(() => {
    const workspace = this.selectedWorkspace();

    return workspace
      ? getWorkspaceNavigationItems(workspace.role, workspace.id)
      : [];
  });

  private readonly authApi = inject(AuthApiService);

  constructor() {
    effect(() => {
      const state = this.authState.state();

      if (state.status === 'authenticated') {
        this.workspaceState.loadMyWorkspaces();
      } else if (state.status === 'unauthenticated') {
        this.workspaceState.reset();
      }
    });

    this.authState.restoreSession();
  }

  protected submitLogin(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.loginError.set('');

    this.authApi
      .login({
        email: this.email().trim(),
        password: this.password(),
      })
      .subscribe({
        next: (response) => {
          this.authState.setAuthenticatedUser(response.user);
          this.password.set('');
          this.isSubmitting.set(false);
        },
        error: (error: unknown) => {
          this.password.set('');
          this.isSubmitting.set(false);

          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.loginError.set('The email address or password is incorrect.');
            return;
          }

          this.loginError.set('Sign-in failed. Please try again later.');
        },
      });
  }

  protected selectWorkspace(workspaceId: string): void {
    this.workspaceState.selectWorkspace(workspaceId);
  }

  protected retryWorkspaceLoad(): void {
    this.workspaceState.loadMyWorkspaces();
  }
}