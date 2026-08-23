import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../src/components/layout/Header';
import type { UserRead, UserWorkspaceMembership, WorkspaceRead } from '../src/types/api';

describe('Header', () => {
  const mockUser: UserRead = {
    id: 'u1',
    email: 'author@miller.org',
    display_name: 'Arthur Miller',
    is_superadmin: false,
  };

  const mockSuperAdmin: UserRead = {
    id: 'u2',
    email: 'super@lores.org',
    display_name: 'Super Admin',
    is_superadmin: true,
  };

  const mockWorkspace: WorkspaceRead = {
    id: 'w1',
    name: 'The Miller Family',
    slug: 'the-miller-family',
    created_by_user_id: 'u1',
    created_at: '2026-08-23T00:00:00Z',
    updated_at: '2026-08-23T00:00:00Z',
  };

  const mockMemberships: UserWorkspaceMembership[] = [
    { workspace: mockWorkspace, role: 'admin' },
  ];

  it('renders brand, active workspace, user details, and controls', () => {
    const onSelectWorkspace = vi.fn();
    const onLogout = vi.fn();
    const onToggleHighContrast = vi.fn();

    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        userRole="admin"
        onSelectWorkspace={onSelectWorkspace}
        onLogout={onLogout}
        highContrast={false}
        onToggleHighContrast={onToggleHighContrast}
      />
    );

    expect(screen.getByText('Lores')).toBeInTheDocument();
    expect(screen.getByText('Arthur Miller')).toBeInTheDocument();
    expect(screen.getByText('author@miller.org')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('w1');
  });

  it('renders Members button for family admin and triggers onOpenMembers', () => {
    const onOpenMembers = vi.fn();

    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        userRole="admin"
        onSelectWorkspace={vi.fn()}
        onOpenMembers={onOpenMembers}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    const membersBtn = screen.getByRole('button', { name: /Manage Family Members/i });
    expect(membersBtn).toBeInTheDocument();
    fireEvent.click(membersBtn);
    expect(onOpenMembers).toHaveBeenCalledTimes(1);
  });

  it('triggers high contrast toggle on button click', () => {
    const onToggleHighContrast = vi.fn();
    const onLogout = vi.fn();

    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        onSelectWorkspace={vi.fn()}
        onLogout={onLogout}
        highContrast={false}
        onToggleHighContrast={onToggleHighContrast}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Toggle High Contrast Mode/i }));
    expect(onToggleHighContrast).toHaveBeenCalledTimes(1);
  });

  it('triggers logout on button click', () => {
    const onLogout = vi.fn();

    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        onSelectWorkspace={vi.fn()}
        onLogout={onLogout}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Log Out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('triggers onCreateWorkspace when New Family button is clicked or selected', () => {
    const onCreateWorkspace = vi.fn();

    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        onSelectWorkspace={vi.fn()}
        onCreateWorkspace={onCreateWorkspace}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Create New Family Tree/i }));
    expect(onCreateWorkspace).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__NEW__' } });
    expect(onCreateWorkspace).toHaveBeenCalledTimes(2);
  });

  it('renders Super Admin button and triggers onOpenSuperAdmin for superadmins', () => {
    const onOpenSuperAdmin = vi.fn();

    render(
      <Header
        currentUser={mockSuperAdmin}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        onSelectWorkspace={vi.fn()}
        onOpenSuperAdmin={onOpenSuperAdmin}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    const adminBtn = screen.getByRole('button', { name: /Open Super Admin Dashboard/i });
    expect(adminBtn).toBeInTheDocument();
    fireEvent.click(adminBtn);
    expect(onOpenSuperAdmin).toHaveBeenCalledTimes(1);
  });
});
