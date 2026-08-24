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

  it('renders Data & Backup button for admin role and triggers onOpenDataBackup', () => {
    const onOpenDataBackup = vi.fn();

    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        userRole="admin"
        onSelectWorkspace={vi.fn()}
        onOpenDataBackup={onOpenDataBackup}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    const backupBtn = screen.getByRole('button', { name: /Manage Family Data and Backup/i });
    expect(backupBtn).toBeInTheDocument();
    expect(screen.getByText('Data & Backup')).toBeInTheDocument();
    fireEvent.click(backupBtn);
    expect(onOpenDataBackup).toHaveBeenCalledTimes(1);
  });

  it('renders Data & Backup button for owner role', () => {
    const onOpenDataBackup = vi.fn();

    render(
      <Header
        currentUser={mockUser}
        workspaces={[{ workspace: mockWorkspace, role: 'owner' }]}
        currentWorkspace={mockWorkspace}
        userRole="owner"
        onSelectWorkspace={vi.fn()}
        onOpenDataBackup={onOpenDataBackup}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Manage Family Data and Backup/i })).toBeInTheDocument();
  });

  it('renders Data & Backup button for superadmin even if workspace role is viewer', () => {
    const onOpenDataBackup = vi.fn();

    render(
      <Header
        currentUser={mockSuperAdmin}
        workspaces={[{ workspace: mockWorkspace, role: 'viewer' }]}
        currentWorkspace={mockWorkspace}
        userRole="viewer"
        onSelectWorkspace={vi.fn()}
        onOpenDataBackup={onOpenDataBackup}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Manage Family Data and Backup/i })).toBeInTheDocument();
  });

  it('does NOT render Data & Backup button for collaborator role', () => {
    render(
      <Header
        currentUser={mockUser}
        workspaces={[{ workspace: mockWorkspace, role: 'collaborator' }]}
        currentWorkspace={mockWorkspace}
        userRole="collaborator"
        onSelectWorkspace={vi.fn()}
        onOpenDataBackup={vi.fn()}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Manage Family Data and Backup/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Data & Backup')).not.toBeInTheDocument();
  });

  it('does NOT render Data & Backup button for viewer role', () => {
    render(
      <Header
        currentUser={mockUser}
        workspaces={[{ workspace: mockWorkspace, role: 'viewer' }]}
        currentWorkspace={mockWorkspace}
        userRole="viewer"
        onSelectWorkspace={vi.fn()}
        onOpenDataBackup={vi.fn()}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Manage Family Data and Backup/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Data & Backup')).not.toBeInTheDocument();
  });

  it('passes axe accessibility audit when Data & Backup button is rendered', async () => {
    const { axe } = await import('vitest-axe');
    const { container } = render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        userRole="admin"
        onSelectWorkspace={vi.fn()}
        onOpenMembers={vi.fn()}
        onOpenDataBackup={vi.fn()}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders mobile navigation menu toggle button with accessible aria attributes', () => {
    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        userRole="admin"
        onSelectWorkspace={vi.fn()}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Open mobile navigation menu/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(toggleBtn.className).toContain('min-w-[44px]');
    expect(toggleBtn.className).toContain('min-h-[44px]');
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();
  });

  it('opens mobile drawer on toggle click and allows triggering secondary actions', () => {
    const onOpenMembers = vi.fn();
    const onOpenDataBackup = vi.fn();
    const onToggleHighContrast = vi.fn();
    const onLogout = vi.fn();

    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        userRole="admin"
        onSelectWorkspace={vi.fn()}
        onOpenMembers={onOpenMembers}
        onOpenDataBackup={onOpenDataBackup}
        onLogout={onLogout}
        highContrast={false}
        onToggleHighContrast={onToggleHighContrast}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Open mobile navigation menu/i });
    fireEvent.click(toggleBtn);

    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    const mobileMenu = screen.getByTestId('mobile-nav-menu');
    expect(mobileMenu).toBeInTheDocument();

    // Secondary actions inside mobile drawer
    const mobileMembersBtn = screen.getByTestId('mobile-menu-members');
    expect(mobileMembersBtn.className).toContain('min-h-[44px]');
    fireEvent.click(mobileMembersBtn);
    expect(onOpenMembers).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();

    // Open again and test high contrast
    fireEvent.click(toggleBtn);
    const mobileContrastBtn = screen.getByTestId('mobile-menu-contrast');
    expect(mobileContrastBtn.className).toContain('min-h-[44px]');
    fireEvent.click(mobileContrastBtn);
    expect(onToggleHighContrast).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();

    // Open again and test logout
    fireEvent.click(toggleBtn);
    const mobileLogoutBtn = screen.getByTestId('mobile-menu-logout');
    expect(mobileLogoutBtn.className).toContain('min-h-[44px]');
    fireEvent.click(mobileLogoutBtn);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();
  });

  it('toggles mobile drawer open and closed when clicking toggle button repeatedly', () => {
    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        onSelectWorkspace={vi.fn()}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Open mobile navigation menu/i });
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('mobile-nav-menu')).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();
  });

  it('renders Super Admin action in mobile menu for superadmin users', () => {
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

    const toggleBtn = screen.getByRole('button', { name: /Open mobile navigation menu/i });
    fireEvent.click(toggleBtn);

    const mobileSuperAdminBtn = screen.getByTestId('mobile-menu-superadmin');
    expect(mobileSuperAdminBtn).toBeInTheDocument();
    expect(mobileSuperAdminBtn.className).toContain('min-h-[44px]');
    fireEvent.click(mobileSuperAdminBtn);
    expect(onOpenSuperAdmin).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();
  });

  it('dismisses mobile drawer when Escape key is pressed', () => {
    render(
      <Header
        currentUser={mockUser}
        workspaces={mockMemberships}
        currentWorkspace={mockWorkspace}
        onSelectWorkspace={vi.fn()}
        onLogout={vi.fn()}
        highContrast={false}
        onToggleHighContrast={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Open mobile navigation menu/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('mobile-nav-menu')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();
  });

  it('dismisses mobile drawer when clicking outside the header', () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <Header
          currentUser={mockUser}
          workspaces={mockMemberships}
          currentWorkspace={mockWorkspace}
          onSelectWorkspace={vi.fn()}
          onLogout={vi.fn()}
          highContrast={false}
          onToggleHighContrast={vi.fn()}
        />
      </div>
    );

    const toggleBtn = screen.getByRole('button', { name: /Open mobile navigation menu/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('mobile-nav-menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();
  });
});

