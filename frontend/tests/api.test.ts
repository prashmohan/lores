import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, tokenStorage, ApiError } from '../src/lib/api';
import type { ImportSummaryRead } from '../src/types/api';

describe('api.dataExchange', () => {
  const mockWorkspaceId = '11111111-2222-3333-4444-555555555555';
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenStorage.set('test-auth-token');
  });

  afterEach(() => {
    tokenStorage.clear();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('exportGedcom', () => {
    it('fetches /workspaces/{id}/export/gedcom with auth token and returns Blob', async () => {
      const mockBlob = new Blob(['0 HEAD\n1 CHAR UTF-8\n0 TRLR'], { type: 'text/plain' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      } as unknown as Response);

      const result = await api.dataExchange.exportGedcom(mockWorkspaceId);

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/workspaces/${mockWorkspaceId}/export/gedcom`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-auth-token',
          }),
        })
      );
      expect(result).toBe(mockBlob);
    });

    it('throws ApiError on export failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ detail: 'Workspace access denied' }),
      } as unknown as Response);

      await expect(api.dataExchange.exportGedcom(mockWorkspaceId)).rejects.toThrow(ApiError);
      await expect(api.dataExchange.exportGedcom(mockWorkspaceId)).rejects.toMatchObject({
        status: 403,
        message: 'Workspace access denied',
      });
    });
  });

  describe('exportJson', () => {
    it('fetches /workspaces/{id}/export/json with auth token and returns Blob', async () => {
      const mockBlob = new Blob(['{"schema_version": "1.0.0"}'], { type: 'application/json' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      } as unknown as Response);

      const result = await api.dataExchange.exportJson(mockWorkspaceId);

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/workspaces/${mockWorkspaceId}/export/json`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-auth-token',
          }),
        })
      );
      expect(result).toBe(mockBlob);
    });
  });

  describe('importGedcom', () => {
    it('sends multipart POST to /workspaces/{id}/import/gedcom and returns summary', async () => {
      const mockSummary: ImportSummaryRead = {
        success: true,
        filename: 'family.ged',
        format: 'gedcom',
        people_created: 5,
        people_merged: 0,
        unions_created: 2,
        children_linked: 3,
        lore_notes_created: 0,
        warnings: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSummary,
      } as unknown as Response);

      const mockFile = new File(['0 HEAD\n0 TRLR'], 'family.ged', { type: 'text/plain' });
      const result = await api.dataExchange.importGedcom(mockWorkspaceId, mockFile);

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/workspaces/${mockWorkspaceId}/import/gedcom`,
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
          headers: expect.objectContaining({
            Authorization: 'Bearer test-auth-token',
          }),
        })
      );

      // Verify that Content-Type is NOT explicitly set in headers so boundary is maintained
      const fetchCallArgs = vi.mocked(global.fetch).mock.calls[0];
      const headers = (fetchCallArgs[1]?.headers ?? {}) as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();

      expect(result).toEqual(mockSummary);
    });

    it('throws ApiError on import error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ detail: 'Uploaded file is empty' }),
      } as unknown as Response);

      const mockFile = new File([], 'empty.ged', { type: 'text/plain' });
      await expect(api.dataExchange.importGedcom(mockWorkspaceId, mockFile)).rejects.toThrow(ApiError);
    });
  });

  describe('importJson', () => {
    it('sends multipart POST to /workspaces/{id}/import/json and returns summary', async () => {
      const mockSummary: ImportSummaryRead = {
        success: true,
        filename: 'backup.json',
        format: 'json',
        people_created: 10,
        people_merged: 2,
        unions_created: 4,
        children_linked: 6,
        lore_notes_created: 3,
        warnings: ['Note already exists'],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSummary,
      } as unknown as Response);

      const mockFile = new File(['{"people": []}'], 'backup.json', { type: 'application/json' });
      const result = await api.dataExchange.importJson(mockWorkspaceId, mockFile);

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/workspaces/${mockWorkspaceId}/import/json`,
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
          headers: expect.objectContaining({
            Authorization: 'Bearer test-auth-token',
          }),
        })
      );

      const fetchCallArgs = vi.mocked(global.fetch).mock.calls[0];
      const headers = (fetchCallArgs[1]?.headers ?? {}) as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();

      expect(result).toEqual(mockSummary);
    });
  });
});

describe('api.workspaces map layout', () => {
  const mockWorkspaceId = '11111111-2222-3333-4444-555555555555';
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenStorage.set('test-auth-token');
  });

  afterEach(() => {
    tokenStorage.clear();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getMapLayout', () => {
    it('fetches /workspaces/{id}/map-layout and returns MapLayoutRead', async () => {
      const mockLayout = {
        positions: {
          'person-1': { x: 120, y: 240 },
        },
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockLayout,
      } as unknown as Response);

      const result = await api.workspaces.getMapLayout(mockWorkspaceId);

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/workspaces/${mockWorkspaceId}/map-layout`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-auth-token',
          }),
        })
      );
      expect(result).toEqual(mockLayout);
    });
  });

  describe('updateMapLayout', () => {
    it('sends PUT /workspaces/{id}/map-layout with positions body and returns MapLayoutRead', async () => {
      const newPositions = {
        'person-1': { x: 300, y: 400 },
        'person-2': { x: 500, y: 600 },
      };
      const mockLayout = {
        positions: newPositions,
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockLayout,
      } as unknown as Response);

      const result = await api.workspaces.updateMapLayout(mockWorkspaceId, newPositions);

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/workspaces/${mockWorkspaceId}/map-layout`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ positions: newPositions }),
          headers: expect.objectContaining({
            Authorization: 'Bearer test-auth-token',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockLayout);
    });
  });

  describe('resetMapLayout', () => {
    it('sends DELETE /workspaces/{id}/map-layout and returns confirmation message', async () => {
      const mockResponse = { message: 'Map layout reset to automatic' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as unknown as Response);

      const result = await api.workspaces.resetMapLayout(mockWorkspaceId);

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/workspaces/${mockWorkspaceId}/map-layout`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-auth-token',
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });
});

describe('api.auth extensions', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenStorage.clear();
  });

  afterEach(() => {
    tokenStorage.clear();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetches auth configuration', async () => {
    const mockConfig = { google_client_id: 'test-client-id', google_auth_enabled: true };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockConfig,
    } as Response);

    const config = await api.auth.getConfig();
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/auth/config', expect.anything());
    expect(config.google_auth_enabled).toBe(true);
    expect(config.google_client_id).toBe('test-client-id');
  });

  it('logs in with Google credential and stores token', async () => {
    const mockToken = {
      access_token: 'google_jwt_token',
      token: 'google_jwt_token',
      token_type: 'bearer',
      user: { id: 'u1', email: 'test@example.com', display_name: 'Test', is_superadmin: false },
    };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockToken,
    } as Response);

    const res = await api.auth.loginWithGoogle('mock_google_credential');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ credential: 'mock_google_credential' }),
      })
    );
    expect(res.access_token).toBe('google_jwt_token');
    expect(tokenStorage.get()).toBe('google_jwt_token');
  });
});
