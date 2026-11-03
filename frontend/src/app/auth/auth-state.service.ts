import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { AuthenticatedUserDto } from './auth.models';
import { AuthApiService } from './auth-api.service';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthenticatedUserDto }
  | { status: 'unauthenticated' }
  | { status: 'error' };

@Injectable({
  providedIn: 'root',
})
export class AuthStateService {
  private readonly authApi = inject(AuthApiService);
  private readonly stateSignal = signal<AuthState>({ status: 'loading' });
  private sessionRestoreStarted = false;

  readonly state = this.stateSignal.asReadonly();

  restoreSession(): void {
    if (this.sessionRestoreStarted) {
      return;
    }

    this.sessionRestoreStarted = true;
    this.stateSignal.set({ status: 'loading' });

    this.authApi.getCurrentUser().subscribe({
      next: (response) => {
        this.stateSignal.set({
          status: 'authenticated',
          user: response.user,
        });
      },
      error: (error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401
        ) {
          this.stateSignal.set({ status: 'unauthenticated' });
          return;
        }

        this.stateSignal.set({ status: 'error' });
      },
    });
  }

  setAuthenticatedUser(user: AuthenticatedUserDto): void {
    this.stateSignal.set({ status: 'authenticated', user });
  }
}