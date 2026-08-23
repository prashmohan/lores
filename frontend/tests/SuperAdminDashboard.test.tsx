import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperAdminDashboard } from '../src/components/admin/SuperAdminDashboard';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({
  api: {
    admin: {
      getWorkspaces: vi.fn(),
      getStats: vi.fn(),
    },
  },
}));

describe('SuperAdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders workspaces and statistics', async () => {
    vi.mocked(api.admin.getWorkspaces).mockResolvedValue([
      {
        id: 'ws-1',
        name: 'The Vance Family Tree',
        slug: 'vance-tree',
        description: 'Vance ancestral records',
        created_at: '2026-08-20T00:00:00Z',
        member_count: 3,
        people_count: 12,
        admins: [
          { id: 'u1', email: 'ronald@vance.com', display_name: 'Ronald Vance' },
        ],
      },
    ]);

    vi.mocked(api.admin.getStats).mockResolvedValue({
      total_workspaces: 5,
      total_users: 14,
      total_people: 48,
      total_lore_notes: 22,
    });

    const onSelectWorkspace = vi.fn();
    const onClose = vi.fn();

    render(
      <SuperAdminDashboard
        isOpen={true}
        onClose={onClose}
        onSelectWorkspace={onSelectWorkspace}
      />
    );

    expect(screen.getByText(/Super Administrator Dashboard/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('The Vance Family Tree')).toBeInTheDocument();
      expect(screen.getByText('/vance-tree')).toBeInTheDocument();
      expect(screen.getByText('Ronald Vance')).toBeInTheDocument();
      expect(screen.getByText('(ronald@vance.com)')).toBeInTheDocument();
      expect(screen.getByText('48')).toBeInTheDocument();
    });

    const openBtn = screen.getByRole('button', { name: /Open Tree/i });
    fireEvent.click(openBtn);

    expect(onSelectWorkspace).toHaveBeenCalledWith('ws-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
