import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FocusPersonView } from '../src/components/tree/FocusPersonView';
import type { FocusNeighborhoodResponse } from '../src/types/api';

const mockNeighborhood: FocusNeighborhoodResponse = {
  focus_person: {
    id: "1",
    first_name: "Margaret",
    last_name: "Miller",
    gender: "female",
    is_living: true,
    birth_date: "1942",
    birth_place: "Chicago, IL",
    death_date: null,
    death_place: null,
    avatar_url: null,
    relationship_label: "Focus Person",
  },
  parents: [
    {
      id: "2",
      first_name: "Arthur",
      last_name: "Miller",
      gender: "male",
      is_living: false,
      birth_date: "1915",
      death_date: "2005",
      birth_place: "New York, NY",
      death_place: "Roxbury, CT",
      avatar_url: null,
      relationship_label: "Father",
    },
    {
      id: "6",
      first_name: "Augusta",
      last_name: "Barnett",
      gender: "female",
      is_living: false,
      birth_date: "1918",
      death_date: "1998",
      birth_place: "New York, NY",
      death_place: "New York, NY",
      avatar_url: null,
      relationship_label: "Mother",
    }
  ],
  partners: [
    {
      id: "3",
      first_name: "George",
      last_name: "Vance",
      gender: "male",
      is_living: true,
      birth_date: "1940",
      death_date: null,
      birth_place: null,
      death_place: null,
      avatar_url: null,
      relationship_label: "Spouse",
    }
  ],
  children: [
    {
      id: "4",
      first_name: "Ronald",
      last_name: "Vance",
      gender: "male",
      is_living: true,
      birth_date: "1968",
      death_date: null,
      birth_place: null,
      death_place: null,
      avatar_url: null,
      relationship_label: "Son",
    }
  ],
  siblings: [
    {
      id: "5",
      first_name: "Robert",
      last_name: "Miller",
      gender: "male",
      is_living: true,
      birth_date: "1945",
      death_date: null,
      birth_place: null,
      death_place: null,
      avatar_url: null,
      relationship_label: "Brother",
    }
  ]
};

describe('FocusPersonView', () => {
  it('renders focus person and immediate 1-hop relatives in large accessible typography', () => {
    const onSelectPerson = vi.fn();
    const onAddRelative = vi.fn();

    render(
      <FocusPersonView
        data={mockNeighborhood}
        onSelectPerson={onSelectPerson}
        onAddRelative={onAddRelative}
      />
    );

    expect(screen.getByText(/Margaret Miller/i)).toBeInTheDocument();
    expect(screen.getByText(/Arthur Miller/i)).toBeInTheDocument();
    expect(screen.getByText(/Augusta Barnett/i)).toBeInTheDocument();
    expect(screen.getByText(/George Vance/i)).toBeInTheDocument();
    expect(screen.getByText(/Ronald Vance/i)).toBeInTheDocument();
    expect(screen.getByText(/Robert Miller/i)).toBeInTheDocument();
  });

  it('triggers onSelectPerson when a relative card is clicked', () => {
    const onSelectPerson = vi.fn();
    const onAddRelative = vi.fn();

    render(
      <FocusPersonView
        data={mockNeighborhood}
        onSelectPerson={onSelectPerson}
        onAddRelative={onAddRelative}
      />
    );

    const parentButton = screen.getByRole('button', { name: /Arthur Miller/i });
    fireEvent.click(parentButton);
    expect(onSelectPerson).toHaveBeenCalledWith('2');

    const siblingButton = screen.getByRole('button', { name: /Robert Miller/i });
    fireEvent.click(siblingButton);
    expect(onSelectPerson).toHaveBeenCalledWith('5');

    const partnerButton = screen.getByRole('button', { name: /George Vance/i });
    fireEvent.click(partnerButton);
    expect(onSelectPerson).toHaveBeenCalledWith('3');

    const childButton = screen.getByRole('button', { name: /Ronald Vance/i });
    fireEvent.click(childButton);
    expect(onSelectPerson).toHaveBeenCalledWith('4');
  });

  it('triggers onAddRelative when add relative buttons are clicked', () => {
    const onSelectPerson = vi.fn();
    const onAddRelative = vi.fn();

    render(
      <FocusPersonView
        data={mockNeighborhood}
        onSelectPerson={onSelectPerson}
        onAddRelative={onAddRelative}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Parent/i }));
    expect(onAddRelative).toHaveBeenCalledWith('parent');

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Sibling/i }));
    expect(onAddRelative).toHaveBeenCalledWith('sibling');

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Partner/i }));
    expect(onAddRelative).toHaveBeenCalledWith('partner');

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Child/i }));
    expect(onAddRelative).toHaveBeenCalledWith('child');
  });

  it('handles empty relatives lists without crashing', () => {
    const emptyNeighborhood: FocusNeighborhoodResponse = {
      focus_person: {
        id: "100",
        first_name: "Lone",
        last_name: "Ancestor",
        gender: "unknown",
        is_living: false,
        birth_date: "1850",
        birth_place: null,
        death_date: "1920",
        death_place: null,
        avatar_url: null,
        relationship_label: null,
      },
      parents: [],
      partners: [],
      children: [],
      siblings: []
    };

    const onSelectPerson = vi.fn();
    const onAddRelative = vi.fn();

    render(
      <FocusPersonView
        data={emptyNeighborhood}
        onSelectPerson={onSelectPerson}
        onAddRelative={onAddRelative}
      />
    );

    expect(screen.getByText(/Lone Ancestor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Add Parent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Add Sibling/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Add Partner/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Add Child/i })).toBeInTheDocument();
  });
});
