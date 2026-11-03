import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api-client';
import {
  CurrentUserResponseDto,
  LoginRequestDto,
} from './auth.models';

@Injectable({
  providedIn: 'root',
})
export class AuthApiService {
  private readonly apiClient = inject(ApiClient);

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
}