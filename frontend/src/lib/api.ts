import type {
  AddRelativeRequest,
  AuditLogRead,
  FocusNeighborhoodResponse,
  LoreNoteCreate,
  LoreNoteRead,
  LoreNoteUpdate,
  OTPRequest,
  OTPResponse,
  OTPVerifyRequest,
  PersonCreate,
  PersonRead,
  PersonUpdate,
  TokenResponse,
  TrashItemRead,
  TrashPurgeResponse,
  TreeOverviewResponse,
  UserRead,
  UserWorkspaceMembership,
  WorkspaceCreate,
  WorkspaceMemberRead,
  WorkspaceRead,
} from '../types/api';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const tokenStorage = {
  get: (): string | null => {
    try {
      return localStorage.getItem('lores_access_token');
    } catch {
      return null;
    }
  },
  set: (token: string): void => {
    try {
      localStorage.setItem('lores_access_token', token);
    } catch {
      // Ignore localStorage errors (e.g. in private browsing/incognito)
    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem('lores_access_token');
    } catch {
      // Ignore
    }
  },
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    let errorData: unknown = null;
    try {
      errorData = await response.json();
      if (typeof errorData === 'object' && errorData !== null) {
        if ('detail' in errorData) {
          const detail = (errorData as { detail: unknown }).detail;
          if (typeof detail === 'string') {
            errorDetail = detail;
          } else if (typeof detail === 'object' && detail !== null && 'message' in detail) {
            errorDetail = (detail as { message: string }).message;
          } else {
            errorDetail = JSON.stringify(detail);
          }
        }
      }
    } catch {
      // Response wasn't json
    }
    throw new ApiError(response.status, errorDetail, errorData);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Auth
  auth: {
    requestOtp: (data: OTPRequest): Promise<OTPResponse> =>
      request<OTPResponse>('/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    verifyOtp: async (data: OTPVerifyRequest): Promise<TokenResponse> => {
      const result = await request<TokenResponse>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result.access_token) {
        tokenStorage.set(result.access_token);
      }
      return result;
    },

    getMe: (): Promise<UserRead> => request<UserRead>('/auth/me'),

    logout: async (): Promise<{ message: string }> => {
      try {
        const res = await request<{ message: string }>('/auth/logout', { method: 'POST' });
        return res;
      } finally {
        tokenStorage.clear();
      }
    },
  },

  // Workspaces
  workspaces: {
    list: (): Promise<UserWorkspaceMembership[]> => request<UserWorkspaceMembership[]>('/workspaces'),

    create: (data: WorkspaceCreate): Promise<WorkspaceRead> =>
      request<WorkspaceRead>('/workspaces', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    get: (workspaceId: string): Promise<WorkspaceRead> =>
      request<WorkspaceRead>(`/workspaces/${workspaceId}`),

    listMembers: (workspaceId: string): Promise<WorkspaceMemberRead[]> =>
      request<WorkspaceMemberRead[]>(`/workspaces/${workspaceId}/members`),

    addMember: (workspaceId: string, email: string, role = 'collaborator'): Promise<WorkspaceMemberRead> =>
      request<WorkspaceMemberRead>(`/workspaces/${workspaceId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      }),

    removeMember: (workspaceId: string, userId: string): Promise<{ message: string }> =>
      request<{ message: string }>(`/workspaces/${workspaceId}/members/${userId}`, {
        method: 'DELETE',
      }),
  },

  // Tree & Focus
  tree: {
    getFocusNeighborhood: (workspaceId: string, personId: string): Promise<FocusNeighborhoodResponse> =>
      request<FocusNeighborhoodResponse>(`/workspaces/${workspaceId}/tree/focus/${personId}`),

    getOverview: (workspaceId: string): Promise<TreeOverviewResponse> =>
      request<TreeOverviewResponse>(`/workspaces/${workspaceId}/tree/overview`),

    addRelative: (workspaceId: string, data: AddRelativeRequest): Promise<PersonRead> =>
      request<PersonRead>(`/workspaces/${workspaceId}/tree/add-relative`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // People
  people: {
    list: (
      workspaceId: string,
      options: { skip?: number; limit?: number; q?: string } = {}
    ): Promise<PersonRead[]> => {
      const params = new URLSearchParams();
      if (options.skip !== undefined) params.set('skip', options.skip.toString());
      if (options.limit !== undefined) params.set('limit', options.limit.toString());
      if (options.q) params.set('q', options.q);
      const query = params.toString() ? `?${params.toString()}` : '';
      return request<PersonRead[]>(`/workspaces/${workspaceId}/people${query}`);
    },

    get: (workspaceId: string, personId: string): Promise<PersonRead> =>
      request<PersonRead>(`/workspaces/${workspaceId}/people/${personId}`),

    create: (workspaceId: string, data: PersonCreate): Promise<PersonRead> =>
      request<PersonRead>(`/workspaces/${workspaceId}/people`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (
      workspaceId: string,
      personId: string,
      updates: PersonUpdate,
      expectedUpdatedAt?: string
    ): Promise<PersonRead> => {
      const query = expectedUpdatedAt ? `?expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}` : '';
      return request<PersonRead>(`/workspaces/${workspaceId}/people/${personId}${query}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },

    delete: (workspaceId: string, personId: string): Promise<{ message: string }> =>
      request<{ message: string }>(`/workspaces/${workspaceId}/people/${personId}`, {
        method: 'DELETE',
      }),
  },

  // Lore
  lore: {
    listForPerson: (workspaceId: string, personId: string): Promise<LoreNoteRead[]> =>
      request<LoreNoteRead[]>(`/workspaces/${workspaceId}/lore/person/${personId}`),

    get: (workspaceId: string, loreId: string): Promise<LoreNoteRead> =>
      request<LoreNoteRead>(`/workspaces/${workspaceId}/lore/${loreId}`),

    create: (workspaceId: string, data: LoreNoteCreate): Promise<LoreNoteRead> =>
      request<LoreNoteRead>(`/workspaces/${workspaceId}/lore`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (workspaceId: string, loreId: string, updates: LoreNoteUpdate): Promise<LoreNoteRead> =>
      request<LoreNoteRead>(`/workspaces/${workspaceId}/lore/${loreId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),

    delete: (workspaceId: string, loreId: string): Promise<{ message: string }> =>
      request<{ message: string }>(`/workspaces/${workspaceId}/lore/${loreId}`, {
        method: 'DELETE',
      }),
  },

  // Trash & Audit
  trash: {
    list: (workspaceId: string, maxAgeDays = 30): Promise<TrashItemRead[]> =>
      request<TrashItemRead[]>(`/workspaces/${workspaceId}/trash?max_age_days=${maxAgeDays}`),

    restore: (workspaceId: string, entityType: string, entityId: string): Promise<{ message: string; entity_id: string }> =>
      request<{ message: string; entity_id: string }>(`/workspaces/${workspaceId}/trash/restore`, {
        method: 'POST',
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
      }),

    purge: (workspaceId: string): Promise<TrashPurgeResponse> =>
      request<TrashPurgeResponse>(`/workspaces/${workspaceId}/trash/purge`, {
        method: 'POST',
      }),

    getAuditLogs: (
      workspaceId: string,
      options: { limit?: number; entityId?: string } = {}
    ): Promise<AuditLogRead[]> => {
      const params = new URLSearchParams();
      if (options.limit !== undefined) params.set('limit', options.limit.toString());
      if (options.entityId) params.set('entity_id', options.entityId);
      const query = params.toString() ? `?${params.toString()}` : '';
      return request<AuditLogRead[]>(`/workspaces/${workspaceId}/audit-logs${query}`);
    },
  },
};
