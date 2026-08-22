import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BreadcrumbBar } from '../src/components/layout/BreadcrumbBar';

describe('BreadcrumbBar', () => {
  const mockHistory = [
    { id: '1', name: 'Arthur Miller' },
    { id: '2', name: 'Margaret Miller' },
    { id: '3', name: 'Ronald Vance' },
  ];

  it('renders history trail with active person highlighted', () => {
    const onSelectPerson = vi.fn();
    const onReset = vi.fn();

    render(
      <BreadcrumbBar
        history={mockHistory}
        onSelectPerson={onSelectPerson}
        onReset={onReset}
      />
    );

    expect(screen.getByText('Arthur Miller')).toBeInTheDocument();
    expect(screen.getByText('Margaret Miller')).toBeInTheDocument();
    expect(screen.getByText('Ronald Vance')).toBeInTheDocument();

    const activeItem = screen.getByText('Ronald Vance');
    expect(activeItem.getAttribute('aria-current')).toBe('page');
  });

  it('navigates when an ancestor breadcrumb is clicked', () => {
    const onSelectPerson = vi.fn();

    render(
      <BreadcrumbBar
        history={mockHistory}
        onSelectPerson={onSelectPerson}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Arthur Miller' }));
    expect(onSelectPerson).toHaveBeenCalledWith('1');
  });

  it('returns null if history is empty', () => {
    const { container } = render(
      <BreadcrumbBar history={[]} onSelectPerson={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
