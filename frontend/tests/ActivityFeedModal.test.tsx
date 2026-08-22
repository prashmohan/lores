import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityFeedModal } from '../src/components/history/ActivityFeedModal';
import { api } from '../src/lib/api';
import type { AuditLogRead } from '../src/types/api';

const mockLogs: AuditLogRead[] = [
  {
    id: 'log-1',
    workspace_id: 'ws-1',
    actor_id: 'user-1',
    actor_name: 'Arthur Miller',
    actor_email: 'arthur@example.com',
    entity_type: 'person',
    entity_id: 'person-1',
    action: 'create',
    changes: { first_name: 'Margaret', last_name: 'Miller' },
    created_at: '2026-08-23T08:00:00Z',
  },
  {
    id: 'log-2',
    workspace_id: 'ws-1',
    actor_id: 'user-1',
    actor_name: 'Arthur Miller',
    actor_email: 'arthur@example.com',
    entity_type: 'lore_note',
    entity_id: 'lore-1',
    action: 'update',
    changes: { title: 'Childhood in Chicago' },
    created_at: '2026-08-23T08:10:00Z',
  },
  {
    id: 'log-3',
    workspace_id: 'ws-1',
    actor_id: 'user-1',
    actor_name: 'Arthur Miller',
    actor_email: 'arthur@example.com',
    entity_type: 'person',
    entity_id: 'person-2',
    action: 'delete',
    changes: {},
    created_at: '2026-08-23T08:15:00Z',
  },
  {
    id: 'log-4',
    workspace_id: 'ws-1',
    actor_id: 'user-1',
    actor_name: 'Arthur Miller',
    actor_email: 'arthur@example.com',
    entity_type: 'person',
    entity_id: 'person-2',
    action: 'restore',
    changes: {},
    created_at: '2026-08-23T08:16:00Z',
  },
];

describe('ActivityFeedModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and renders audit log entries with appropriate badges', async () => {
    const getAuditLogsSpy = vi.spyOn(api.trash, 'getAuditLogs').mockResolvedValue(mockLogs);
    const onClose = vi.fn();

    render(
      <ActivityFeedModal
        isOpen={true}
        onClose={onClose}
        workspaceId="ws-1"
      />
    );

    expect(screen.getByText(/Family Activity Feed/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(getAuditLogsSpy).toHaveBeenCalledWith('ws-1', { limit: 50 });
      expect(screen.getByText(/Created/i)).toBeInTheDocument();
      expect(screen.getByText(/Updated/i)).toBeInTheDocument();
      expect(screen.getByText(/Deleted/i)).toBeInTheDocument();
      expect(screen.getByText(/Restored/i)).toBeInTheDocument();
    });
  });

  it('toggles changes diff view on click', async () => {
    vi.spyOn(api.trash, 'getAuditLogs').mockResolvedValue(mockLogs);
    const onClose = vi.fn();

    render(
      <ActivityFeedModal
        isOpen={true}
        onClose={onClose}
        workspaceId="ws-1"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/View Changes/i).length).toBeGreaterThan(0);
    });

    const viewChangesButtons = screen.getAllByText(/View Changes/i);
    // Click first view changes button (log 1)
    fireEvent.click(viewChangesButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/"first_name": "Margaret"/i)).toBeInTheDocument();
    });
  });

  it('handles empty activity logs gracefully', async () => {
    vi.spyOn(api.trash, 'getAuditLogs').mockResolvedValue([]);
    const onClose = vi.fn();

    render(
      <ActivityFeedModal
        isOpen={true}
        onClose={onClose}
        workspaceId="ws-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/No Activity Yet/i)).toBeInTheDocument();
    });
  });

  it('does not render when isOpen is false', () => {
    const onClose = vi.fn();

    render(
      <ActivityFeedModal
        isOpen={false}
        onClose={onClose}
        workspaceId="ws-1"
      />
    );

    expect(screen.queryByText(/Family Activity Feed/i)).not.toBeInTheDocument();
  });
});
