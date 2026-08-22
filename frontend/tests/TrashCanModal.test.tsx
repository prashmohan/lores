import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrashCanModal } from '../src/components/history/TrashCanModal';
import { api } from '../src/lib/api';
import type { TrashItemRead } from '../src/types/api';

const mockTrashItems: TrashItemRead[] = [
  {
    id: 'person-1',
    entity_type: 'person',
    name: 'George Vance',
    deleted_at: '2026-08-20T10:00:00Z',
    days_remaining: 27,
  },
  {
    id: 'lore-1',
    entity_type: 'lore_note',
    name: 'Vacation to Michigan 1974',
    deleted_at: '2026-08-15T12:00:00Z',
    days_remaining: 22,
  },
];

describe('TrashCanModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and renders trash items with days remaining', async () => {
    const listSpy = vi.spyOn(api.trash, 'list').mockResolvedValue(mockTrashItems);
    const onClose = vi.fn();

    render(
      <TrashCanModal
        isOpen={true}
        onClose={onClose}
        workspaceId="ws-1"
      />
    );

    expect(screen.getByText(/Family Trash/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith('ws-1', 30);
      expect(screen.getByText(/George Vance/i)).toBeInTheDocument();
      expect(screen.getByText(/27 days left/i)).toBeInTheDocument();
      expect(screen.getByText(/Vacation to Michigan 1974/i)).toBeInTheDocument();
      expect(screen.getByText(/22 days left/i)).toBeInTheDocument();
    });
  });

  it('restores an item when Restore button is clicked', async () => {
    vi.spyOn(api.trash, 'list').mockResolvedValue(mockTrashItems);
    const restoreSpy = vi.spyOn(api.trash, 'restore').mockResolvedValue({
      message: 'person restored successfully',
      entity_id: 'person-1',
    });
    const onRestored = vi.fn();
    const onClose = vi.fn();

    render(
      <TrashCanModal
        isOpen={true}
        onClose={onClose}
        workspaceId="ws-1"
        onRestored={onRestored}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/George Vance/i)).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /Restore/i });
    fireEvent.click(restoreButtons[0]);

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith('ws-1', 'person', 'person-1');
      expect(onRestored).toHaveBeenCalledWith(mockTrashItems[0]);
      expect(screen.getByText(/Successfully restored "George Vance"/i)).toBeInTheDocument();
    });
  });

  it('empties trash when Empty Trash is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(api.trash, 'list').mockResolvedValue(mockTrashItems);
    const purgeSpy = vi.spyOn(api.trash, 'purge').mockResolvedValue({
      purged_count: 2,
      message: 'Trash emptied successfully',
    });
    const onClose = vi.fn();

    render(
      <TrashCanModal
        isOpen={true}
        onClose={onClose}
        workspaceId="ws-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Empty Trash/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Empty Trash/i }));

    await waitFor(() => {
      expect(purgeSpy).toHaveBeenCalledWith('ws-1');
      expect(screen.getByText(/Emptied trash/i)).toBeInTheDocument();
      expect(screen.getByText(/Trash is Empty/i)).toBeInTheDocument();
    });
  });

  it('renders empty state when there are no items in trash', async () => {
    vi.spyOn(api.trash, 'list').mockResolvedValue([]);
    const onClose = vi.fn();

    render(
      <TrashCanModal
        isOpen={true}
        onClose={onClose}
        workspaceId="ws-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Trash is Empty/i)).toBeInTheDocument();
    });
  });

  it('does not render when isOpen is false', () => {
    const onClose = vi.fn();

    render(
      <TrashCanModal
        isOpen={false}
        onClose={onClose}
        workspaceId="ws-1"
      />
    );

    expect(screen.queryByText(/Family Trash/i)).not.toBeInTheDocument();
  });
});
