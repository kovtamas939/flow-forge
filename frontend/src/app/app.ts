import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { AuthApiService } from './auth/auth-api.service';
import { AuthStateService } from './auth/auth-state.service';

@Component({
  imports: [FormsModule, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly authState = inject(AuthStateService);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly loginError = signal('');

  private readonly authApi = inject(AuthApiService);

  constructor() {
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

          this.loginError.set(
            'Sign-in failed. Please try again later.',
          );
        },
      });
  }
}