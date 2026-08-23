import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { FocusPersonView } from '../src/components/tree/FocusPersonView';
import { PersonCard } from '../src/components/tree/PersonCard';
import { BirdseyeMapCanvas, type MapPerson } from '../src/components/map/BirdseyeMapCanvas';
import { AddRelativeModal } from '../src/components/tree/AddRelativeModal';
import { CreateWorkspaceModal } from '../src/components/workspace/CreateWorkspaceModal';
import { SuperAdminDashboard } from '../src/components/admin/SuperAdminDashboard';
import { ActivityFeedModal } from '../src/components/history/ActivityFeedModal';
import { TrashCanModal } from '../src/components/history/TrashCanModal';
import { LoginForm } from '../src/components/auth/LoginForm';
import { VerifyOtpModal } from '../src/components/auth/VerifyOtpModal';
import { Header } from '../src/components/layout/Header';

import type { FocusNeighborhoodResponse, PersonSummary, UserRead, WorkspaceRead, UserWorkspaceMembership } from '../src/types/api';

const mockPerson: PersonSummary = {
  id: '10',
  first_name: 'Margaret',
  last_name: 'Miller',
  maiden_name: 'Higgins',
  gender: 'female',
  birth_date: '1942',
  birth_place: 'Boston, MA',
  is_living: true,
  death_date: null,
  death_place: null,
};

const mockNeighborhood: FocusNeighborhoodResponse = {
  focus_person: mockPerson,
  parents: [
    {
      id: '1',
      first_name: 'Arthur',
      last_name: 'Miller',
      gender: 'male',
      birth_date: '1915',
      death_date: '2005',
      is_living: false,
    },
  ],
  siblings: [
    {
      id: '2',
      first_name: 'Robert',
      last_name: 'Miller',
      gender: 'male',
      birth_date: '1945',
      death_date: null,
      is_living: true,
    },
  ],
  partners: [
    {
      id: '3',
      first_name: 'George',
      last_name: 'Vance',
      gender: 'male',
      birth_date: '1940',
      death_date: '2018',
      is_living: false,
    },
  ],
  children: [
    {
      id: '4',
      first_name: 'Ronald',
      last_name: 'Vance',
      gender: 'male',
      birth_date: '1968',
      death_date: null,
      is_living: true,
    },
  ],
};

const mockMapPeople: MapPerson[] = [
  mockPerson,
  ...mockNeighborhood.parents,
  ...mockNeighborhood.siblings,
  ...mockNeighborhood.partners,
  ...mockNeighborhood.children,
];

const mockUser: UserRead = {
  id: 'u-1',
  email: 'storykeeper@example.com',
  display_name: 'Storykeeper',
  is_superadmin: false,
  created_at: '2026-08-23T00:00:00Z',
  last_login_at: null,
};

const mockWorkspace: WorkspaceRead = {
  id: 'ws-1',
  name: 'The Miller Family',
  slug: 'the-miller-family',
  description: 'Our family stories',
  created_by_user_id: 'u-1',
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:00:00Z',
};

const mockMembership: UserWorkspaceMembership = {
  workspace: mockWorkspace,
  role: 'owner',
};

describe('Accessibility (a11y) Automated Audits with Axe', () => {
  it('FocusPersonView passes axe accessibility audit', async () => {
    const { container } = render(
      <FocusPersonView
        data={mockNeighborhood}
        onSelectPerson={vi.fn()}
        onAddRelative={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('PersonCard component passes axe accessibility audit', async () => {
    const { container } = render(
      <PersonCard
        person={mockPerson}
        isFocus={true}
        onClick={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('BirdseyeMapCanvas passes axe accessibility audit', async () => {
    const { container } = render(
      <BirdseyeMapCanvas
        people={mockMapPeople}
        focusPersonId="10"
        onSelectPerson={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('AddRelativeModal open dialog passes axe accessibility audit', async () => {
    const { container } = render(
      <AddRelativeModal
        isOpen={true}
        onClose={vi.fn()}
        focusPerson={mockPerson}
        relativeType="child"
        onSubmit={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('CreateWorkspaceModal open dialog passes axe accessibility audit', async () => {
    const { container } = render(
      <CreateWorkspaceModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('SuperAdminDashboard open dialog passes axe accessibility audit', async () => {
    const { container } = render(
      <SuperAdminDashboard
        isOpen={true}
        onClose={vi.fn()}
        onSelectWorkspace={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('ActivityFeedModal open dialog passes axe accessibility audit', async () => {
    const { container } = render(
      <ActivityFeedModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-1"
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('TrashCanModal open dialog passes axe accessibility audit', async () => {
    const { container } = render(
      <TrashCanModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-1"
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('LoginForm passes axe accessibility audit', async () => {
    const { container } = render(
      <LoginForm onOtpRequested={vi.fn()} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('VerifyOtpModal passes axe accessibility audit', async () => {
    const { container } = render(
      <VerifyOtpModal
        isOpen={true}
        email="storykeeper@example.com"
        onSuccess={vi.fn()}
        onBack={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('Header passes axe accessibility audit', async () => {
    const { container } = render(
      <Header
        currentUser={mockUser}
        workspaces={[mockMembership]}
        currentWorkspace={mockWorkspace}
        onSelectWorkspace={vi.fn()}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
