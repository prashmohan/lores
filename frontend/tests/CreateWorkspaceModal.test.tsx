import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CreateWorkspaceModal } from '../src/components/workspace/CreateWorkspaceModal';

describe('CreateWorkspaceModal', () => {
  it('renders input fields when open', () => {
    render(
      <CreateWorkspaceModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('Create New Family Tree')).toBeInTheDocument();
    expect(screen.getByLabelText(/Family Tree Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description \/ Notes/i)).toBeInTheDocument();
  });

  it('submits valid form data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <CreateWorkspaceModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/Family Tree Name/i), {
      target: { value: 'Miller Ancestry' },
    });
    fireEvent.change(screen.getByLabelText(/Description \/ Notes/i), {
      target: { value: 'Oral records from 1920 onwards' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Family Tree/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Miller Ancestry', 'Oral records from 1920 onwards');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
