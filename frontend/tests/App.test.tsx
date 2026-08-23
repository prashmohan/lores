import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../src/App';
import { api, tokenStorage } from '../src/lib/api';
import type { FocusNeighborhoodResponse, PersonRead, UserRead, UserWorkspaceMembership } from '../src/types/api';

const mockUser: UserRead = {
  id: 'user-1',
  email: 'arthur@example.com',
  display_name: 'Arthur Miller',
  is_superadmin: false,
};

const mockWorkspaces: UserWorkspaceMembership[] = [
  {
    workspace: {
      id: 'ws-1',
      name: "Miller's Family Tree",
      slug: 'millers-family-tree',
      description: 'Family tree',
      created_by_user_id: 'user-1',
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:00:00Z',
    },
    role: 'admin',
  },
];

const mockNeighborhood: FocusNeighborhoodResponse = {
  focus_person: {
    id: 'person-1',
    first_name: 'Margaret',
    last_name: 'Miller',
    gender: 'female',
    is_living: true,
    birth_date: '1942',
    birth_place: 'Chicago, IL',
    death_date: null,
    death_place: null,
    avatar_url: null,
  },
  parents: [],
  partners: [],
  children: [],
  siblings: [],
};

const mockPeople: PersonRead[] = [
  {
    id: 'person-1',
    workspace_id: 'ws-1',
    first_name: 'Margaret',
    last_name: 'Miller',
    gender: 'female',
    is_living: true,
    birth_date: '1942',
    birth_date_qualifier: 'exact',
    birth_place: 'Chicago, IL',
    death_date: null,
    death_date_qualifier: 'exact',
    death_place: null,
    is_deleted: false,
    created_at: '2026-08-23T00:00:00Z',
    updated_at: '2026-08-23T00:00:00Z',
  },
];

describe('App navigation and modals', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tokenStorage, 'get').mockReturnValue('mock-token');
    vi.spyOn(api.auth, 'getMe').mockResolvedValue(mockUser);
    vi.spyOn(api.workspaces, 'list').mockResolvedValue(mockWorkspaces);
    vi.spyOn(api.workspaces, 'listMembers').mockResolvedValue([]);
    vi.spyOn(api.people, 'list').mockResolvedValue(mockPeople);
    vi.spyOn(api.tree, 'getFocusNeighborhood').mockResolvedValue(mockNeighborhood);
    vi.spyOn(api.tree, 'getOverview').mockResolvedValue({
      people: mockPeople,
      edges: [
        { id: 'edge-1', source_id: 'person-1', target_id: 'person-2', edge_type: 'partner' },
      ],
    });
    vi.spyOn(api.trash, 'getAuditLogs').mockResolvedValue([]);
    vi.spyOn(api.trash, 'list').mockResolvedValue([]);
  });

  it('renders top navigation tabs when authenticated', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Focus View/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Bird's-Eye Map/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Family Activity/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Family Trash/i })).toBeInTheDocument();
    });
  });

  it('switches to BirdseyeMapCanvas when Bird\'s-Eye Map tab is clicked and renders edges', async () => {
    const multiPeople: PersonRead[] = [
      mockPeople[0],
      {
        id: 'person-2',
        workspace_id: 'ws-1',
        first_name: 'Arthur',
        last_name: 'Miller',
        gender: 'male',
        is_living: false,
        birth_date: '1915',
        birth_date_qualifier: 'exact',
        birth_place: 'New York, NY',
        death_date: '2005',
        death_date_qualifier: 'exact',
        death_place: null,
        is_deleted: false,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-23T00:00:00Z',
      },
    ];
    vi.spyOn(api.people, 'list').mockResolvedValue(multiPeople);
    vi.spyOn(api.tree, 'getOverview').mockResolvedValue({
      people: multiPeople,
      edges: [
        { id: 'edge-1', source_id: 'person-1', target_id: 'person-2', edge_type: 'partner' },
      ],
    });

    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Bird's-Eye Map/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Bird's-Eye Map/i }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Family Tree Overview Map/i })).toBeInTheDocument();
    });

    // Verify connecting edge paths exist in the SVG
    await waitFor(() => {
      const paths = container.querySelectorAll('svg g g path');
      expect(paths.length).toBeGreaterThan(0);
      const hasPartnerColor = Array.from(paths).some((p) => p.getAttribute('stroke') === '#f43f5e');
      expect(hasPartnerColor).toBe(true);
    });
  });

  it('opens CreateWorkspaceModal when New Family button is clicked in header', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create New Family Tree/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Create New Family Tree/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Create New Family Tree/i })).toBeInTheDocument();
    });
  });

  it('opens FamilyMembersModal when Members button is clicked in header for admin', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Manage Family Members/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage Family Members/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Family Members & Roles/i })).toBeInTheDocument();
    });
  });

  it('opens ActivityFeedModal when Family Activity button is clicked', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Family Activity/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Family Activity/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Family Activity Feed/i })).toBeInTheDocument();
    });
  });

  it('opens TrashCanModal when Family Trash button is clicked', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Family Trash/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Family Trash/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Family Trash/i })).toBeInTheDocument();
      expect(screen.getByText(/30-Day Recovery Bin/i)).toBeInTheDocument();
    });
  });

  it('opens DataBackupModal when Data & Backup button is clicked in header for admin', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Manage Family Data and Backup/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage Family Data and Backup/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Data & Backup/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Export Family Tree/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Import Family Tree/i })).toBeInTheDocument();
    });
  });

  it('fetches map layout and passes server positions to BirdseyeMapCanvas', async () => {
    const getMapLayoutSpy = vi.spyOn(api.workspaces, 'getMapLayout').mockResolvedValue({
      positions: {
        'person-1': { x: 777, y: 888 },
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Bird's-Eye Map/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Bird's-Eye Map/i }));

    await waitFor(() => {
      expect(getMapLayoutSpy).toHaveBeenCalledWith('ws-1');
    });

    await waitFor(() => {
      const node1 = screen.getByTestId('map-node-person-1');
      expect(node1).toBeInTheDocument();
      expect(node1.getAttribute('transform')).toContain('translate(777, 888)');
    });
  });
});

