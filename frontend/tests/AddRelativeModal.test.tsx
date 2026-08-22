import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddRelativeModal } from '../src/components/tree/AddRelativeModal';
import type { PersonSummary } from '../src/types/api';

describe('AddRelativeModal', () => {
  const mockFocusPerson: PersonSummary = {
    id: '1',
    first_name: 'Margaret',
    last_name: 'Miller',
    gender: 'female',
    is_living: true,
  };

  it('renders modal dialog with appropriate fields when open', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <AddRelativeModal
        isOpen={true}
        onClose={onClose}
        relativeType="parent"
        focusPerson={mockFocusPerson}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText(/Add Parent for Margaret Miller/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/This person is living/i)).toBeInTheDocument();
  });

  it('submits form with valid data', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <AddRelativeModal
        isOpen={true}
        onClose={onClose}
        relativeType="parent"
        focusPerson={mockFocusPerson}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Arthur' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Miller' } });
    fireEvent.change(screen.getByLabelText(/Birth Date/i), { target: { value: '1915' } });

    fireEvent.click(screen.getByRole('button', { name: /Add Parent/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'parent',
        expect.objectContaining({
          first_name: 'Arthur',
          last_name: 'Miller',
          birth_date: '1915',
          is_living: true,
        }),
        undefined,
        undefined
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('selects other parent when adding a child to a focus person with partners', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const mockPartners: PersonSummary[] = [
      { id: '2', first_name: 'George', last_name: 'Vance', gender: 'male', is_living: true },
    ];

    render(
      <AddRelativeModal
        isOpen={true}
        onClose={onClose}
        relativeType="child"
        focusPerson={mockFocusPerson}
        partners={mockPartners}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByLabelText(/Who is the other parent of this child/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'David' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Vance' } });

    fireEvent.click(screen.getByRole('button', { name: /Add Child/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'child',
        expect.objectContaining({
          first_name: 'David',
          last_name: 'Vance',
        }),
        undefined,
        '2'
      );
    });
  });

  it('allows switching to link existing person mode', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const allPeople = [
      { id: '1', workspace_id: 'w1', first_name: 'Margaret', last_name: 'Miller', gender: 'female', is_living: true, birth_date_qualifier: 'exact', death_date_qualifier: 'exact', is_deleted: false, created_at: '', updated_at: '' },
      { id: '3', workspace_id: 'w1', first_name: 'Clara', last_name: 'Higgins', gender: 'female', is_living: true, birth_date_qualifier: 'exact', death_date_qualifier: 'exact', is_deleted: false, created_at: '', updated_at: '' },
    ];

    render(
      <AddRelativeModal
        isOpen={true}
        onClose={onClose}
        relativeType="parent"
        focusPerson={mockFocusPerson}
        allPeople={allPeople}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Link Existing Person/i }));
    expect(screen.getByLabelText(/Select Person from Family Tree/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Select Person from Family Tree/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Link as Parent/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('parent', undefined, '3', undefined);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('does not render when isOpen is false', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AddRelativeModal
        isOpen={false}
        onClose={onClose}
        relativeType="parent"
        focusPerson={mockFocusPerson}
        onSubmit={onSubmit}
      />
    );

    expect(screen.queryByText(/Add Parent/i)).not.toBeInTheDocument();
  });
});
