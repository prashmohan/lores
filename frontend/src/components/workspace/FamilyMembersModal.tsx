import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Users,
  UserPlus,
  Trash2,
  Loader2,
  ShieldCheck,
  Edit3,
  Eye,
  CheckCircle2,
  TreePine,
  Save,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { WorkspaceMemberRead, WorkspaceRead } from '../../types/api';

interface FamilyMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  workspaceDescription?: string | null;
  currentUserId?: string;
  onWorkspaceUpdated?: (updated: WorkspaceRead) => void;
}

export const FamilyMembersModal: React.FC<FamilyMembersModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  workspaceDescription,
  currentUserId,
  onWorkspaceUpdated,
}) => {
  const [name, setName] = useState(workspaceName);
  const [description, setDescription] = useState(workspaceDescription || '');
  const [metadataLoading, setMetadataLoading] = useState(false);

  const [members, setMembers] = useState<WorkspaceMemberRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'collaborator' | 'viewer' | 'admin'>('collaborator');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.workspaces.listMembers(workspaceId);
      setMembers(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load members.');
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen) {
      setName(workspaceName);
      setDescription(workspaceDescription || '');
      setSuccessMsg(null);
      setError(null);
      loadMembers();
    }
  }, [isOpen, workspaceName, workspaceDescription, loadMembers]);

  if (!isOpen) return null;

  const handleUpdateMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Family tree name cannot be empty.');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setMetadataLoading(true);

    try {
      const updated = await api.workspaces.update(workspaceId, {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
      });
      setSuccessMsg('Tree details updated successfully.');
      if (onWorkspaceUpdated) {
        onWorkspaceUpdated(updated);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update tree details.');
      }
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setError(null);
    setSuccessMsg(null);
    setInviteLoading(true);

    try {
      const added = await api.workspaces.addMember(workspaceId, inviteEmail.trim().toLowerCase(), inviteRole);
      setSuccessMsg(`Successfully added ${added.email || inviteEmail} as ${inviteRole}.`);
      setInviteEmail('');
      setInviteRole('collaborator');
      await loadMembers();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to invite member.');
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (member: WorkspaceMemberRead, newRole: string) => {
    if (!member.email) return;
    setError(null);
    setSuccessMsg(null);

    try {
      await api.workspaces.addMember(workspaceId, member.email, newRole);
      setSuccessMsg(`Updated ${member.email}'s role to ${newRole}.`);
      await loadMembers();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update member role.');
      }
    }
  };

  const handleRemove = async (userId: string, memberEmail?: string | null) => {
    const confirmText = memberEmail
      ? `Are you sure you want to remove ${memberEmail} from this family tree?`
      : 'Are you sure you want to remove this member?';

    if (!window.confirm(confirmText)) return;

    setRemovingUserId(userId);
    setError(null);
    setSuccessMsg(null);

    try {
      await api.workspaces.removeMember(workspaceId, userId);
      setSuccessMsg('Member removed successfully.');
      await loadMembers();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to remove member.');
      }
    } finally {
      setRemovingUserId(null);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
      case 'owner':
        return <ShieldCheck className="w-4 h-4 text-purple-700" />;
      case 'collaborator':
        return <Edit3 className="w-4 h-4 text-emerald-700" />;
      case 'viewer':
      default:
        return <Eye className="w-4 h-4 text-blue-700" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
      case 'owner':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'collaborator':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'viewer':
      default:
        return 'bg-blue-100 text-blue-900 border-blue-300';
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" />
        <Dialog.Content
          className="fixed bottom-0 sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl z-50 max-h-[85vh] sm:max-h-[90vh] flex flex-col border-2 border-slate-200 focus:outline-none"
          aria-describedby="family-members-description"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                <Users className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <Dialog.Title className="text-xl font-extrabold text-slate-900 leading-tight">
                  Family Members & Roles
                </Dialog.Title>
                <p id="family-members-description" className="text-xs text-slate-600 font-medium">
                  Manage collaborators, viewers, and administrators for <strong className="text-slate-800">{workspaceName}</strong>.
                </p>
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close family members dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Feedback messages */}
          {error && (
            <div
              role="alert"
              className="mt-4 p-3.5 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-xs font-semibold shrink-0"
            >
              {error}
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="mt-4 p-3.5 bg-emerald-50 border-2 border-emerald-200 rounded-2xl text-emerald-900 text-xs font-semibold flex items-center gap-2 shrink-0"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto py-4 space-y-6">
            {/* Tree Details Section */}
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
                <TreePine className="w-4 h-4 text-amber-700" />
                <span>Family Tree Details</span>
              </h3>

              <form onSubmit={handleUpdateMetadata} className="space-y-3">
                <div>
                  <label htmlFor="workspace_name" className="block text-xs font-bold text-slate-700 mb-1">
                    Family Tree Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="workspace_name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., The Miller Family"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium bg-white"
                  />
                </div>

                <div>
                  <label htmlFor="workspace_description" className="block text-xs font-bold text-slate-700 mb-1">
                    Description & Story Summary
                  </label>
                  <textarea
                    id="workspace_description"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Preserving oral history and lineage across five generations."
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium bg-white resize-y"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={metadataLoading || !name.trim()}
                    className="min-h-[44px] px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm rounded-xl shadow transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {metadataLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>{metadataLoading ? 'Saving...' : 'Save Tree Details'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Invite Form */}
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4 text-amber-700" />
                <span>Invite or Add Family Member</span>
              </h3>

              <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-6">
                  <label htmlFor="member_email" className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="member_email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="relative@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="member_role" className="block text-xs font-bold text-slate-700 mb-1">
                    Role
                  </label>
                  <select
                    id="member_role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'collaborator' | 'viewer' | 'admin')}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-bold bg-white"
                  >
                    <option value="collaborator">Collaborator</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={inviteLoading || !inviteEmail.trim()}
                    className="w-full min-h-[44px] px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm rounded-xl shadow transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    <span>{inviteLoading ? 'Adding...' : 'Add Member'}</span>
                  </button>
                </div>
              </form>
              <p className="text-xs text-slate-500 font-normal mt-2">
                <strong>Collaborators</strong> can edit people, relationships, and lore stories. <strong>Viewers</strong> are read-only.
              </p>
            </div>

            {/* Current Members List */}
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center justify-between">
                <span>Current Members ({members.length})</span>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-amber-700" />}
              </h3>

              <div className="border-2 border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200 bg-white">
                {members.length === 0 && !loading && (
                  <div className="p-6 text-center text-sm font-medium text-slate-500">
                    No members found in this family tree.
                  </div>
                )}

                {members.map((member) => {
                  const isCurrentUser = currentUserId && member.user_id === currentUserId;
                  const isRemoving = removingUserId === member.user_id;

                  return (
                    <div
                      key={member.id}
                      className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center font-extrabold text-slate-800 text-sm shrink-0">
                          {member.display_name?.charAt(0).toUpperCase() || member.email?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm">
                              {member.display_name || member.email?.split('@')[0] || 'Member'}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 font-medium">
                            {member.email || 'No email provided'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold border ${getRoleBadgeColor(
                              member.role
                            )}`}
                          >
                            {getRoleIcon(member.role)}
                            <span className="capitalize">{member.role}</span>
                          </span>

                          {!isCurrentUser && (
                            <select
                              aria-label={`Change role for ${member.email || member.display_name}`}
                              value={member.role}
                              onChange={(e) => handleRoleChange(member, e.target.value)}
                              className="min-h-[44px] text-base sm:text-xs font-bold px-2 py-1 border border-slate-300 rounded-lg bg-white text-slate-800 cursor-pointer"
                            >
                              <option value="collaborator">Collaborator</option>
                              <option value="viewer">Viewer</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                        </div>

                        {!isCurrentUser && (
                          <button
                            type="button"
                            onClick={() => handleRemove(member.user_id, member.email)}
                            disabled={isRemoving}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50 cursor-pointer"
                            aria-label={`Remove ${member.email || member.display_name} from family`}
                            title="Remove member"
                          >
                            {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-6 py-2.5 rounded-xl border-2 border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors cursor-pointer text-sm flex items-center justify-center"
            >
              Done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
