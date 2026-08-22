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
      expect(onSubmit).toHaveBeenCalledWith('parent', expect.objectContaining({
        first_name: 'Arthur',
        last_name: 'Miller',
        birth_date: '1915',
        is_living: true,
      }));
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
