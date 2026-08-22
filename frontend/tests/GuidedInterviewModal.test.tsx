import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GuidedInterviewModal } from '../src/components/interview/GuidedInterviewModal';

describe('GuidedInterviewModal', () => {
  it('renders conversational assistant with step 1 and base person name', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <GuidedInterviewModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        basePersonName="Margaret Miller"
      />
    );

    expect(screen.getByText(/Family Lore Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Margaret Miller/i)).toBeInTheDocument();
    expect(screen.getByText(/Who would you like to add\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Parent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Partner/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Child/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sibling/i })).toBeInTheDocument();
  });

  it('navigates to step 2 upon selecting relationship type', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <GuidedInterviewModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        basePersonName="Margaret Miller"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Child/i }));

    expect(screen.getByText(/What is their first name\?/i)).toBeInTheDocument();
    expect(screen.getByText(/What is their last name \/ family name\?/i)).toBeInTheDocument();
    expect(screen.getByText(/What year were they born\?/i)).toBeInTheDocument();
  });

  it('allows going back from step 2 to step 1', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <GuidedInterviewModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        basePersonName="Margaret Miller"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Sibling/i }));
    expect(screen.getByText(/What is their first name\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText(/Who would you like to add\?/i)).toBeInTheDocument();
  });

  it('submits relative data when form is filled and Save Relative is clicked', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <GuidedInterviewModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        basePersonName="Margaret Miller"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Partner/i }));

    const firstNameInput = screen.getByLabelText(/What is their first name\?/i);
    const lastNameInput = screen.getByLabelText(/What is their last name \/ family name\?/i);
    const birthYearInput = screen.getByLabelText(/What year were they born\?/i);

    fireEvent.change(firstNameInput, { target: { value: 'George' } });
    fireEvent.change(lastNameInput, { target: { value: 'Vance' } });
    fireEvent.change(birthYearInput, { target: { value: '1940' } });

    const saveButton = screen.getByRole('button', { name: /Save Relative/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        relative_type: 'partner',
        first_name: 'George',
        last_name: 'Vance',
        maiden_name: undefined,
        birth_date: '1940',
        birth_place: undefined,
        is_living: true,
        death_date: undefined,
        notes: undefined,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('disables Save button when first name is empty', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <GuidedInterviewModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        basePersonName="Margaret Miller"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Parent/i }));

    const saveButton = screen.getByRole('button', { name: /Save Relative/i });
    expect(saveButton).toBeDisabled();
  });

  it('does not render when isOpen is false', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <GuidedInterviewModal
        isOpen={false}
        onClose={onClose}
        onSubmit={onSubmit}
        basePersonName="Margaret Miller"
      />
    );

    expect(screen.queryByText(/Family Lore Assistant/i)).not.toBeInTheDocument();
  });
});
