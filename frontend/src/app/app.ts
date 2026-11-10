import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet } from '@angular/router';
import { AuthApiService } from './auth/auth-api.service';
import { AuthStateService } from './auth/auth-state.service';
import { WorkspaceApiService } from './workspaces/workspace-api.service';
import { WorkspaceStateService } from './workspaces/workspace-state.service';

type AuthMode = 'login' | 'register';

@Component({
  imports: [FormsModule, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly authState = inject(AuthStateService);
  protected readonly workspaceState = inject(WorkspaceStateService);

  protected readonly authMode = signal<AuthMode>('login');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly loginError = signal('');
  protected readonly registrationError = signal('');
  protected readonly registrationSuccess = signal('');

  protected readonly workspaceName = signal('');
  protected readonly isCreatingWorkspace = signal(false);
  protected readonly workspaceCreationError = signal('');

  protected readonly isLoggingOut = signal(false);
  protected readonly logoutError = signal('');

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

  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly workspaceApi = inject(WorkspaceApiService);

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
    this.registrationSuccess.set('');

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

  protected submitRegistration(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.registrationError.set('');

    this.authApi
      .register({
        email: this.email().trim(),
        password: this.password(),
      })
      .subscribe({
        next: () => {
          this.password.set('');
          this.isSubmitting.set(false);
          this.authMode.set('login');
          this.registrationSuccess.set(
            'Your account was created. Sign in to continue.',
          );
        },
        error: (error: unknown) => {
          this.password.set('');
          this.isSubmitting.set(false);

          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.registrationError.set(
              'An account with this email address already exists.',
            );
            return;
          }

          if (error instanceof HttpErrorResponse && error.status === 400) {
            this.registrationError.set(
              'The email address or password does not meet the requirements.',
            );
            return;
          }

          this.registrationError.set(
            'Account creation failed. Please try again later.',
          );
        },
      });
  }

  protected switchAuthMode(mode: AuthMode): void {
    this.authMode.set(mode);
    this.password.set('');
    this.loginError.set('');
    this.registrationError.set('');
    this.registrationSuccess.set('');
  }

  protected createWorkspace(): void {
    if (this.isCreatingWorkspace()) {
      return;
    }

    const name = this.workspaceName().trim();

    if (name.length === 0) {
      this.workspaceCreationError.set('Enter a workspace name.');
      return;
    }

    this.isCreatingWorkspace.set(true);
    this.workspaceCreationError.set('');

    this.workspaceApi.createWorkspace(name).subscribe({
      next: (response) => {
        this.workspaceState.addCreatedWorkspace(response.workspace);
        this.workspaceName.set('');
        this.isCreatingWorkspace.set(false);
        this.navigateToWorkspace(response.workspace.id);
      },
      error: (error: unknown) => {
        this.isCreatingWorkspace.set(false);

        if (error instanceof HttpErrorResponse && error.status === 400) {
          this.workspaceCreationError.set(
            'The workspace name must be between 1 and 120 characters.',
          );
          return;
        }

        this.workspaceCreationError.set(
          'Could not create the workspace. Check your access and try again.',
        );
      },
    });
  }

  protected logout(): void {
    if (this.isLoggingOut()) {
      return;
    }

    this.isLoggingOut.set(true);
    this.logoutError.set('');

    this.authApi.logout().subscribe({
      next: () => {
        this.isLoggingOut.set(false);
        this.finishLogout();
      },
      error: (error: unknown) => {
        this.isLoggingOut.set(false);

        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.finishLogout();
          return;
        }

        this.logoutError.set('Sign-out failed. Please try again.');
      },
    });
  }

  protected selectWorkspace(workspaceId: string): void {
    this.workspaceState.selectWorkspace(workspaceId);
    this.navigateToWorkspace(workspaceId);
  }

  protected retryWorkspaceLoad(): void {
    this.workspaceState.loadMyWorkspaces();
  }

  private finishLogout(): void {
    this.authState.setUnauthenticated();
    void this.router.navigateByUrl('/');
  }

  private navigateToWorkspace(workspaceId: string): void {
    void this.router.navigate([
      '/workspaces',
      workspaceId,
      'workflows',
    ]);
  }
}