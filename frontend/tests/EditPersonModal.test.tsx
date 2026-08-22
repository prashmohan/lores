import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditPersonModal } from '../src/components/tree/EditPersonModal';
import type { PersonSummary } from '../src/types/api';

describe('EditPersonModal', () => {
  const mockPerson: PersonSummary = {
    id: 'p1',
    first_name: 'Margaret',
    last_name: 'Miller',
    maiden_name: 'Higgins',
    gender: 'female',
    is_living: true,
    birth_date: '1942',
    birth_place: 'Boston, MA',
  };

  it('renders modal with person details populated', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onDelete = vi.fn();

    render(
      <EditPersonModal
        isOpen={true}
        onClose={onClose}
        person={mockPerson}
        onSave={onSave}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText(/Edit Details for Margaret Miller/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Margaret')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Miller')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Higgins')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1942')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Boston, MA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Person/i })).toBeInTheDocument();
  });

  it('submits updated data on save', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn();

    render(
      <EditPersonModal
        isOpen={true}
        onClose={onClose}
        person={mockPerson}
        onSave={onSave}
        onDelete={onDelete}
      />
    );

    fireEvent.change(screen.getByDisplayValue('Boston, MA'), {
      target: { value: 'Cambridge, MA' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('p1', expect.objectContaining({
        first_name: 'Margaret',
        last_name: 'Miller',
        birth_place: 'Cambridge, MA',
      }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('triggers delete flow when delete is confirmed', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <EditPersonModal
        isOpen={true}
        onClose={onClose}
        person={mockPerson}
        onSave={onSave}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete Person/i }));
    expect(screen.getByText(/Move this person to Family Trash/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm Move to Trash/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('p1');
      expect(onClose).toHaveBeenCalled();
    });
  });
});
