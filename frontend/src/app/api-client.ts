import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { API_BASE_URL } from './api-config';

type CsrfTokenResponseDto = {
  csrfToken: string;
};

const CSRF_HEADER_NAME = 'x-flowforge-csrf';

const PUBLIC_STATE_CHANGING_PATHS = new Set([
  'auth/register',
  'auth/login',
]);

@Injectable({
  providedIn: 'root',
})
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<TResponse>(path: string): Observable<TResponse> {
    return this.http.get<TResponse>(this.createUrl(path));
  }

  post<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Observable<TResponse> {
    const normalizedPath = this.normalizePath(path);
    const url = this.createUrl(normalizedPath);

    return this.withCsrfToken(normalizedPath, (headers) =>
      this.http.post<TResponse>(url, body, { headers }),
    );
  }

  put<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Observable<TResponse> {
    const normalizedPath = this.normalizePath(path);
    const url = this.createUrl(normalizedPath);

    return this.withCsrfToken(normalizedPath, (headers) =>
      this.http.put<TResponse>(url, body, { headers }),
    );
  }

  private withCsrfToken<TResponse>(
    path: string,
    sendRequest: (headers: HttpHeaders) => Observable<TResponse>,
  ): Observable<TResponse> {
    if (PUBLIC_STATE_CHANGING_PATHS.has(path)) {
      return sendRequest(new HttpHeaders());
    }

    return this.http
      .get<CsrfTokenResponseDto>(this.createUrl('auth/csrf'))
      .pipe(
        switchMap(({ csrfToken }) =>
          sendRequest(
            new HttpHeaders({
              [CSRF_HEADER_NAME]: csrfToken,
            }),
          ),
        ),
      );
  }

  private createUrl(path: string): string {
    return `${API_BASE_URL}/${this.normalizePath(path)}`;
  }

  private normalizePath(path: string): string {
    return path.replace(/^\/+/, '');
  }
}