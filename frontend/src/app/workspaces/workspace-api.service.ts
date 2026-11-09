import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api-client';
import type {
  CreateWorkspaceResponseDto,
  UserWorkspacesResponseDto,
} from './workspace.models';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceApiService {
  private readonly apiClient = inject(ApiClient);

  listMyWorkspaces(): Observable<UserWorkspacesResponseDto> {
    return this.apiClient.get<UserWorkspacesResponseDto>('workspaces');
  }

  createWorkspace(
    name: string,
  ): Observable<CreateWorkspaceResponseDto> {
    return this.apiClient.post<
      { name: string },
      CreateWorkspaceResponseDto
    >('workspaces', { name });
  }
}