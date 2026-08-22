import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BirdseyeMapCanvas, type MapPerson } from '../src/components/map/BirdseyeMapCanvas';

const mockPeople: MapPerson[] = [
  {
    id: '1',
    first_name: 'Arthur',
    last_name: 'Miller',
    gender: 'male',
    birth_date: '1915',
    death_date: '2005',
    is_living: false,
  },
  {
    id: '2',
    first_name: 'Augusta',
    last_name: 'Barnett',
    gender: 'female',
    birth_date: '1918',
    death_date: '1998',
    is_living: false,
  },
  {
    id: '3',
    first_name: 'Margaret',
    last_name: 'Miller',
    gender: 'female',
    birth_date: '1942',
    death_date: null,
    is_living: true,
  },
  {
    id: '4',
    first_name: 'Ronald',
    last_name: 'Vance',
    gender: 'male',
    birth_date: '1968',
    death_date: null,
    is_living: true,
  },
];

describe('BirdseyeMapCanvas', () => {
  it('renders SVG map canvas with nodes for each person', () => {
    const onSelectPerson = vi.fn();

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
        onSelectPerson={onSelectPerson}
      />
    );

    expect(screen.getByRole('region', { name: /Family Tree Overview Map/i })).toBeInTheDocument();
    expect(screen.getByText(/Arthur Miller/i)).toBeInTheDocument();
    expect(screen.getByText(/Augusta Barnett/i)).toBeInTheDocument();
    expect(screen.getByText(/Margaret Miller/i)).toBeInTheDocument();
    expect(screen.getByText(/Ronald Vance/i)).toBeInTheDocument();
  });

  it('triggers onSelectPerson when a person node is clicked', () => {
    const onSelectPerson = vi.fn();

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
        onSelectPerson={onSelectPerson}
      />
    );

    const arthurNode = screen.getByRole('button', { name: /Arthur Miller/i });
    fireEvent.click(arthurNode);
    expect(onSelectPerson).toHaveBeenCalledWith('1');

    const ronaldNode = screen.getByRole('button', { name: /Ronald Vance/i });
    fireEvent.click(ronaldNode);
    expect(onSelectPerson).toHaveBeenCalledWith('4');
  });

  it('triggers onSelectPerson on keyboard Enter or Space', () => {
    const onSelectPerson = vi.fn();

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
        onSelectPerson={onSelectPerson}
      />
    );

    const margaretNode = screen.getByRole('button', { name: /Margaret Miller/i });
    fireEvent.keyDown(margaretNode, { key: 'Enter' });
    expect(onSelectPerson).toHaveBeenCalledWith('3');

    fireEvent.keyDown(margaretNode, { key: ' ' });
    expect(onSelectPerson).toHaveBeenCalledWith('3');
  });

  it('handles zoom in, zoom out, and reset controls without crashing', () => {
    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
      />
    );

    const zoomInBtn = screen.getByRole('button', { name: /Zoom In/i });
    const zoomOutBtn = screen.getByRole('button', { name: /Zoom Out/i });
    const resetBtn = screen.getByRole('button', { name: /Reset View/i });

    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomOutBtn);
    fireEvent.click(resetBtn);

    expect(screen.getByRole('region', { name: /Family Tree Overview Map/i })).toBeInTheDocument();
  });

  it('renders empty state when people list is empty', () => {
    render(<BirdseyeMapCanvas people={[]} />);

    expect(screen.getByText(/No Family Records Yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Add family members in the Focus View/i)).toBeInTheDocument();
  });
});
