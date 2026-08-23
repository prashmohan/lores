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

  it('renders family relationships and triggers relationship disconnection', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onRemoveRelationship = vi.fn().mockResolvedValue(undefined);

    const relatives = {
      parents: [
        {
          id: 'parent-1',
          first_name: 'Arthur',
          last_name: 'Miller',
          gender: 'male',
          is_living: false,
        },
      ],
      partners: [
        {
          id: 'partner-1',
          first_name: 'George',
          last_name: 'Vance',
          gender: 'male',
          is_living: true,
        },
      ],
      children: [
        {
          id: 'child-1',
          first_name: 'Ronald',
          last_name: 'Vance',
          gender: 'male',
          is_living: true,
        },
      ],
    };

    render(
      <EditPersonModal
        isOpen={true}
        onClose={onClose}
        person={mockPerson}
        relatives={relatives}
        onSave={onSave}
        onDelete={onDelete}
        onRemoveRelationship={onRemoveRelationship}
      />
    );

    expect(screen.getByText('Family Relationships')).toBeInTheDocument();
    expect(screen.getByText('Arthur Miller')).toBeInTheDocument();
    expect(screen.getByText('George Vance')).toBeInTheDocument();
    expect(screen.getByText('Ronald Vance')).toBeInTheDocument();

    // Click disconnect on partner George Vance
    const disconnectPartnerBtn = screen.getByRole('button', {
      name: /Disconnect partner George Vance/i,
    });
    fireEvent.click(disconnectPartnerBtn);

    // Verify confirmation prompt
    expect(
      screen.getByText(/Disconnect George Vance as partner\?/i)
    ).toBeInTheDocument();

    // Confirm disconnect
    fireEvent.click(screen.getByRole('button', { name: /Confirm Disconnect/i }));

    await waitFor(() => {
      expect(onRemoveRelationship).toHaveBeenCalledWith('partner-1', 'partner');
    });
  });

  it('renders avatar photo section and opens PhotoCropModal when clicked', async () => {
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

    // Verify avatar photo section and Upload Photo button
    const uploadPhotoBtn = screen.getByRole('button', { name: /Upload Photo/i });
    expect(uploadPhotoBtn).toBeInTheDocument();

    fireEvent.click(uploadPhotoBtn);
    expect(screen.getByRole('dialog', { name: /Photo for Margaret Miller/i })).toBeInTheDocument();
  });

  it('submits updated data without last name when cleared', async () => {
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

    fireEvent.change(screen.getByDisplayValue('Miller'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('p1', expect.objectContaining({
        first_name: 'Margaret',
        last_name: null,
      }));
      expect(onClose).toHaveBeenCalled();
    });
  });
});

