import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';

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
    return this.http.post<TResponse>(this.createUrl(path), body);
  }

  put<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Observable<TResponse> {
    return this.http.put<TResponse>(this.createUrl(path), body);
  }

  private createUrl(path: string): string {
    const normalizedPath = path.replace(/^\/+/, '');
    return `${API_BASE_URL}/${normalizedPath}`;
  }
}