import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api-client';
import type {
  CurrentUserResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
} from './auth.models';

@Injectable({
  providedIn: 'root',
})
export class AuthApiService {
  private readonly apiClient = inject(ApiClient);

  register(
    credentials: RegisterRequestDto,
  ): Observable<CurrentUserResponseDto> {
    return this.apiClient.post<
      RegisterRequestDto,
      CurrentUserResponseDto
    >('auth/register', credentials);
  }

  login(
    credentials: LoginRequestDto,
  ): Observable<CurrentUserResponseDto> {
    return this.apiClient.post<LoginRequestDto, CurrentUserResponseDto>(
      'auth/login',
      credentials,
    );
  }

  getCurrentUser(): Observable<CurrentUserResponseDto> {
    return this.apiClient.get<CurrentUserResponseDto>('auth/me');
  }

  logout(): Observable<void> {
    return this.apiClient.post<Record<string, never>, void>(
      'auth/logout',
      {},
    );
  }
}