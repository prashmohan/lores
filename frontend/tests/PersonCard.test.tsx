import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PersonCard } from '../src/components/tree/PersonCard';
import type { PersonSummary } from '../src/types/api';

describe('PersonCard', () => {
  const mockPerson: PersonSummary = {
    id: 'p1',
    first_name: 'Arthur',
    last_name: 'Miller',
    gender: 'male',
    is_living: false,
    birth_date: '1915',
    death_date: '2005',
    birth_place: 'New York, NY',
    death_place: 'Roxbury, CT',
    avatar_url: null,
    relationship_label: 'Father',
  };

  it('renders person name, relationship label, and life dates', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('Father')).toBeInTheDocument();
    expect(screen.getByText('Arthur Miller')).toBeInTheDocument();
    expect(screen.getByText('1915 — 2005')).toBeInTheDocument();
    expect(screen.getByText(/New York, NY/i)).toBeInTheDocument();
  });

  it('renders maiden name when present', () => {
    const mother: PersonSummary = {
      ...mockPerson,
      id: 'p2',
      first_name: 'Clara',
      last_name: 'Miller',
      maiden_name: 'Higgins',
      gender: 'female',
      relationship_label: 'Mother',
    };

    render(<PersonCard person={mother} />);
    expect(screen.getByText('Clara Miller (née Higgins)')).toBeInTheDocument();
  });

  it('renders living person indicator when is_living is true', () => {
    const livingPerson: PersonSummary = {
      ...mockPerson,
      id: 'p3',
      is_living: true,
      birth_date: '1942',
      death_date: null,
      relationship_label: null,
    };

    render(<PersonCard person={livingPerson} />);
    expect(screen.getByText('b. 1942')).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', () => {
    const onClick = vi.fn();
    render(<PersonCard person={mockPerson} onClick={onClick} />);

    const button = screen.getByRole('button', { name: /Arthur Miller/i });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onEdit handler when edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<PersonCard person={mockPerson} onEdit={onEdit} />);

    const editBtn = screen.getByRole('button', { name: /Edit details for Arthur Miller/i });
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(mockPerson);
  });

  it('applies focus styles when isFocus is true', () => {
    const { container } = render(<PersonCard person={mockPerson} isFocus={true} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('bg-amber-50');
    expect(card.className).toContain('border-amber-500');
  });

  it('allows long names to flow to next line without truncation', () => {
    const longNamePerson: PersonSummary = {
      ...mockPerson,
      first_name: 'Alexandrina Victoria',
      last_name: 'Saxe-Coburg-Gotha-Battenberg',
    };

    const { rerender } = render(<PersonCard person={longNamePerson} />);
    const nameHeading = screen.getByRole('heading', { level: 3, name: 'Alexandrina Victoria Saxe-Coburg-Gotha-Battenberg' });
    expect(nameHeading.className).not.toContain('truncate');
    expect(nameHeading.className).toContain('break-words');

    // Also test clickable version
    rerender(<PersonCard person={longNamePerson} onClick={() => {}} />);
    const clickableHeading = screen.getByRole('heading', { level: 3, name: 'Alexandrina Victoria Saxe-Coburg-Gotha-Battenberg' });
    expect(clickableHeading.className).not.toContain('truncate');
    expect(clickableHeading.className).toContain('break-words');
  });
});
