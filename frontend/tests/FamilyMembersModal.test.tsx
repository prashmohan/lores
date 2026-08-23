import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FamilyMembersModal } from '../src/components/workspace/FamilyMembersModal';
import { api } from '../src/lib/api';
import type { WorkspaceMemberRead } from '../src/types/api';

const mockMembers: WorkspaceMemberRead[] = [
  {
    id: 'm-1',
    workspace_id: 'ws-1',
    user_id: 'u-1',
    email: 'admin@example.com',
    display_name: 'Arthur Miller',
    role: 'admin',
    joined_at: '2026-08-23T00:00:00Z',
  },
  {
    id: 'm-2',
    workspace_id: 'ws-1',
    user_id: 'u-2',
    email: 'collab@example.com',
    display_name: 'Ronald Vance',
    role: 'collaborator',
    joined_at: '2026-08-23T01:00:00Z',
  },
  {
    id: 'm-3',
    workspace_id: 'ws-1',
    user_id: 'u-3',
    email: 'viewer@example.com',
    display_name: 'Margaret Miller',
    role: 'viewer',
    joined_at: '2026-08-23T02:00:00Z',
  },
];

describe('FamilyMembersModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api.workspaces, 'listMembers').mockResolvedValue(mockMembers);
  });

  it('renders member list with correct role badges and members count', async () => {
    render(
      <FamilyMembersModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-1"
        workspaceName="Miller Family"
        currentUserId="u-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Family Members & Roles/i)).toBeInTheDocument();
      expect(screen.getByText(/Current Members \(3\)/i)).toBeInTheDocument();
      expect(screen.getByText('Arthur Miller')).toBeInTheDocument();
      expect(screen.getByText('Ronald Vance')).toBeInTheDocument();
      expect(screen.getByText('Margaret Miller')).toBeInTheDocument();
      expect(screen.getAllByText(/admin/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/collaborator/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/viewer/i).length).toBeGreaterThan(0);
      expect(screen.getByText('You')).toBeInTheDocument();
    });
  });

  it('allows family admin to invite new member with specific role', async () => {
    const addMemberSpy = vi.spyOn(api.workspaces, 'addMember').mockResolvedValue({
      id: 'm-4',
      workspace_id: 'ws-1',
      user_id: 'u-4',
      email: 'newcousin@example.com',
      display_name: 'New Cousin',
      role: 'collaborator',
      joined_at: '2026-08-23T03:00:00Z',
    });

    render(
      <FamilyMembersModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-1"
        workspaceName="Miller Family"
        currentUserId="u-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Current Members \(3\)/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/Email Address/i);
    fireEvent.change(emailInput, { target: { value: 'newcousin@example.com' } });

    const roleSelect = document.querySelector('#member_role') as HTMLSelectElement;
    expect(roleSelect).not.toBeNull();
    fireEvent.change(roleSelect, { target: { value: 'collaborator' } });

    const submitBtn = screen.getByRole('button', { name: /Add Member/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(addMemberSpy).toHaveBeenCalledWith('ws-1', 'newcousin@example.com', 'collaborator');
    });
  });

  it('allows family admin to remove a member', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const removeMemberSpy = vi.spyOn(api.workspaces, 'removeMember').mockResolvedValue({ message: 'Member removed' });

    render(
      <FamilyMembersModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-1"
        workspaceName="Miller Family"
        currentUserId="u-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Ronald Vance')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /Remove collab@example.com from family/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(removeMemberSpy).toHaveBeenCalledWith('ws-1', 'u-2');
    });
  });

  it('renders tree details with initial name and description and allows editing', async () => {
    const updateWorkspaceSpy = vi.spyOn(api.workspaces, 'update').mockResolvedValue({
      id: 'ws-1',
      name: 'The Arthur Miller Lineage',
      slug: 'miller-family-123',
      description: 'Documenting the Miller family ancestors',
      created_by_user_id: 'u-1',
      created_at: '2026-08-20T00:00:00Z',
      updated_at: '2026-08-24T00:00:00Z',
    });

    const onWorkspaceUpdated = vi.fn();

    render(
      <FamilyMembersModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-1"
        workspaceName="Miller Family"
        workspaceDescription="Original description"
        currentUserId="u-1"
        onWorkspaceUpdated={onWorkspaceUpdated}
      />
    );

    // Verify fields populated
    const nameInput = screen.getByLabelText(/Tree Name|Family Tree Name/i) as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();
    expect(nameInput.value).toBe('Miller Family');

    const descInput = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;
    expect(descInput).toBeInTheDocument();
    expect(descInput.value).toBe('Original description');

    // Change name and description
    fireEvent.change(nameInput, { target: { value: 'The Arthur Miller Lineage' } });
    fireEvent.change(descInput, { target: { value: 'Documenting the Miller family ancestors' } });

    const saveBtn = screen.getByRole('button', { name: /Save Tree Details|Save Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateWorkspaceSpy).toHaveBeenCalledWith('ws-1', {
        name: 'The Arthur Miller Lineage',
        description: 'Documenting the Miller family ancestors',
      });
      expect(onWorkspaceUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ws-1',
          name: 'The Arthur Miller Lineage',
          description: 'Documenting the Miller family ancestors',
        })
      );
      expect(screen.getByText(/Tree details updated successfully/i)).toBeInTheDocument();
    });
  });

  it('displays an error message when saving tree details fails', async () => {
    vi.spyOn(api.workspaces, 'update').mockRejectedValue(new Error('Network error'));

    render(
      <FamilyMembersModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-1"
        workspaceName="Miller Family"
        workspaceDescription="Original description"
        currentUserId="u-1"
      />
    );

    const nameInput = screen.getByLabelText(/Tree Name|Family Tree Name/i);
    fireEvent.change(nameInput, { target: { value: 'Updated Family' } });

    const saveBtn = screen.getByRole('button', { name: /Save Tree Details|Save Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Network error|Failed to update tree details/i)).toBeInTheDocument();
    });
  });
});

