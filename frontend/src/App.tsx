import React, { useState, useEffect, useCallback } from 'react';
import { api, tokenStorage, ApiError } from './lib/api';
import type {
  UserRead,
  UserWorkspaceMembership,
  WorkspaceRead,
  FocusNeighborhoodResponse,
  PersonCreate,
  PersonRead,
  PersonSummary,
  PersonUpdate,
} from './types/api';
import { Header } from './components/layout/Header';
import { FocusPersonView, type RelativeType } from './components/tree/FocusPersonView';
import { AddRelativeModal } from './components/tree/AddRelativeModal';
import { EditPersonModal, type RelativeGroup } from './components/tree/EditPersonModal';
import { BirdseyeMapCanvas } from './components/map/BirdseyeMapCanvas';
import { ActivityFeedModal } from './components/history/ActivityFeedModal';
import { TrashCanModal } from './components/history/TrashCanModal';
import { CreateWorkspaceModal } from './components/workspace/CreateWorkspaceModal';
import { FamilyMembersModal } from './components/workspace/FamilyMembersModal';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { LoginForm } from './components/auth/LoginForm';
import { VerifyOtpModal } from './components/auth/VerifyOtpModal';
import { UserPlus, Plus, Loader2, Compass, Network, History, Trash2 } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserRead | null>(null);
  const [workspaces, setWorkspaces] = useState<UserWorkspaceMembership[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceRead | null>(null);
  const [focusNeighborhood, setFocusNeighborhood] = useState<FocusNeighborhoodResponse | null>(null);
  const [allPeople, setAllPeople] = useState<PersonRead[]>([]);
  const [editingPersonRelatives, setEditingPersonRelatives] = useState<RelativeGroup | null>(null);
  const [highContrast, setHighContrast] = useState(() => {
    try {
      return localStorage.getItem('lores_theme_high_contrast') === 'true';
    } catch {
      return false;
    }
  });

  // Active view tab: 'focus' or 'map'
  const [activeTab, setActiveTab] = useState<'focus' | 'map'>('focus');

  // Auth flow states
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  // Modal states
  const [addRelativeType, setAddRelativeType] = useState<RelativeType | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonSummary | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isSuperAdminOpen, setIsSuperAdminOpen] = useState(false);

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize high-contrast class and local storage
  useEffect(() => {
    if (highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
    try {
      localStorage.setItem('lores_theme_high_contrast', String(highContrast));
    } catch {
      // Ignore storage errors
    }
  }, [highContrast]);

  // Toggle high-contrast mode
  const handleToggleHighContrast = () => {
    setHighContrast((prev) => !prev);
  };

  // Fetch focus neighborhood for a person
  const loadFocusNeighborhood = useCallback(
    async (workspaceId: string, personId: string) => {
      setTreeLoading(true);
      setError(null);
      try {
        const data = await api.tree.getFocusNeighborhood(workspaceId, personId);
        setFocusNeighborhood(data);
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to load focus person.');
        }
      } finally {
        setTreeLoading(false);
      }
    },
    []
  );

  // Initial load for a workspace
  const initWorkspaceTree = useCallback(
    async (workspace: WorkspaceRead) => {
      setCurrentWorkspace(workspace);
      setFocusNeighborhood(null);
      setError(null);

      try {
        const people = await api.people.list(workspace.id, { limit: 100 });
        setAllPeople(people);
        if (people.length > 0) {
          await loadFocusNeighborhood(workspace.id, people[0].id);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        }
      }
    },
    [loadFocusNeighborhood]
  );

  // Refresh people list and overview edges
  const refreshPeopleList = useCallback(async () => {
    if (!currentWorkspace) return;
    try {
      const people = await api.people.list(currentWorkspace.id, { limit: 100 });
      setAllPeople(people);
    } catch {
      // Ignore background refresh errors
    }
  }, [currentWorkspace]);

  // Load user data and workspaces
  const loadUserData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await api.auth.getMe();
      setCurrentUser(user);

      const userWorkspaces = await api.workspaces.list();
      setWorkspaces(userWorkspaces);

      if (userWorkspaces.length > 0) {
        const active = userWorkspaces[0].workspace;
        await initWorkspaceTree(active);
      } else {
        // Create a default initial family workspace if none exists
        try {
          const newWs = await api.workspaces.create({
            name: `${user.display_name || 'My'}'s Family Tree`,
            description: 'My family tree in Lores',
          });
          const updatedWorkspaces: UserWorkspaceMembership[] = [
            { workspace: newWs, role: 'admin' },
          ];
          setWorkspaces(updatedWorkspaces);
          await initWorkspaceTree(newWs);
        } catch {
          // If creation fails, user can create manually
        }
      }
    } catch {
      tokenStorage.clear();
      setCurrentUser(null);
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setFocusNeighborhood(null);
      setAllPeople([]);
    } finally {
      setLoading(false);
    }
  }, [initWorkspaceTree]);

  // Check auth state on mount
  useEffect(() => {
    const token = tokenStorage.get();
    if (token) {
      loadUserData();
    } else {
      setLoading(false);
    }
  }, [loadUserData]);

  // Logout handler
  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      tokenStorage.clear();
    }
    setCurrentUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    setFocusNeighborhood(null);
    setAllPeople([]);
  };

  // Auth callbacks
  const handleOtpRequested = (email: string, otpDev?: string | null) => {
    setAuthEmail(email);
    setDevOtp(otpDev || null);
    setIsVerifyOpen(true);
  };

  const handleAuthSuccess = () => {
    setIsVerifyOpen(false);
    setAuthEmail(null);
    setDevOtp(null);
    loadUserData();
  };

  // Switch focus person
  const handleSelectPerson = (personId: string) => {
    if (!currentWorkspace) return;
    loadFocusNeighborhood(currentWorkspace.id, personId);
  };

  // Open add relative modal
  const handleOpenAddRelative = (type: RelativeType) => {
    setAddRelativeType(type);
    setIsAddModalOpen(true);
  };

  // Open edit person modal
  const handleOpenEditPerson = async (person: PersonSummary) => {
    setEditingPerson(person);
    setIsEditModalOpen(true);
    if (currentWorkspace) {
      if (focusNeighborhood && focusNeighborhood.focus_person.id === person.id) {
        setEditingPersonRelatives({
          parents: focusNeighborhood.parents,
          partners: focusNeighborhood.partners,
          children: focusNeighborhood.children,
          siblings: focusNeighborhood.siblings,
        });
      } else {
        try {
          const neigh = await api.tree.getFocusNeighborhood(currentWorkspace.id, person.id);
          setEditingPersonRelatives({
            parents: neigh.parents,
            partners: neigh.partners,
            children: neigh.children,
            siblings: neigh.siblings,
          });
        } catch {
          setEditingPersonRelatives(null);
        }
      }
    }
  };

  // Save edited person
  const handleSavePersonEdit = async (personId: string, updates: PersonUpdate) => {
    if (!currentWorkspace) return;
    await api.people.update(currentWorkspace.id, personId, updates);
    await refreshPeopleList();
    if (focusNeighborhood) {
      await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id);
    }
  };

  // Disconnect / remove family relationship
  const handleRemoveRelationship = async (
    targetPersonId: string,
    relationshipType: 'partner' | 'parent' | 'child'
  ) => {
    if (!currentWorkspace || !editingPerson) return;
    await api.tree.removeRelationship(currentWorkspace.id, {
      base_person_id: editingPerson.id,
      target_person_id: targetPersonId,
      relationship_type: relationshipType,
    });

    await refreshPeopleList();
    if (focusNeighborhood) {
      await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id);
    }
    try {
      const neigh = await api.tree.getFocusNeighborhood(currentWorkspace.id, editingPerson.id);
      setEditingPersonRelatives({
        parents: neigh.parents,
        partners: neigh.partners,
        children: neigh.children,
        siblings: neigh.siblings,
      });
    } catch {
      // ignore
    }
  };

  // Delete person (soft-delete to 30-day trash)
  const handleDeletePerson = async (personId: string) => {
    if (!currentWorkspace) return;
    await api.people.delete(currentWorkspace.id, personId);
    await refreshPeopleList();
    const remainingPeople = allPeople.filter((p) => p.id !== personId);
    if (remainingPeople.length > 0) {
      await loadFocusNeighborhood(currentWorkspace.id, remainingPeople[0].id);
    } else {
      setFocusNeighborhood(null);
    }
  };

  // Submit relative via form modal (new or existing, with optional other parent)
  const handleAddRelativeSubmit = async (
    type: RelativeType,
    personData?: PersonCreate,
    existingPersonId?: string,
    otherParentId?: string
  ) => {
    if (!currentWorkspace || !focusNeighborhood) return;
    await api.tree.addRelative(currentWorkspace.id, {
      relative_type: type,
      base_person_id: focusNeighborhood.focus_person.id,
      person_data: personData,
      existing_person_id: existingPersonId,
      other_parent_id: otherParentId,
    });

    await refreshPeopleList();
    await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id);
  };

  // Handle restore event from trash modal
  const handleTrashRestored = async () => {
    if (!currentWorkspace) return;
    await refreshPeopleList();
    if (focusNeighborhood) {
      await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id);
    }
  };

  // Create new workspace handler
  const handleCreateWorkspace = async (name: string, description?: string) => {
    const newWs = await api.workspaces.create({ name, description });
    const userWorkspaces = await api.workspaces.list();
    setWorkspaces(userWorkspaces);
    await initWorkspaceTree(newWs);
  };

  // Open workspace from super admin dashboard
  const handleSelectWorkspaceFromAdmin = async (workspaceId: string) => {
    const existing = workspaces.find((w) => w.workspace.id === workspaceId);
    if (existing) {
      await initWorkspaceTree(existing.workspace);
    } else {
      const ws = await api.workspaces.get(workspaceId);
      await initWorkspaceTree(ws);
    }
  };

  // Create initial root person for empty workspace
  const handleCreateRootPerson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentWorkspace) return;
    const formData = new FormData(e.currentTarget);
    const firstName = (formData.get('first_name') as string)?.trim();
    const lastName = (formData.get('last_name') as string)?.trim();
    const birthDate = (formData.get('birth_date') as string)?.trim();

    if (!firstName || !lastName) return;

    setTreeLoading(true);
    try {
      const newPerson = await api.people.create(currentWorkspace.id, {
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate || undefined,
        is_living: true,
      });
      await refreshPeopleList();
      await loadFocusNeighborhood(currentWorkspace.id, newPerson.id);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setTreeLoading(false);
    }
  };

  // Render Loading Spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
          <p className="text-base font-bold text-slate-700">Loading Lores...</p>
        </div>
      </div>
    );
  }

  // Render Login View if not logged in
  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Lores</h1>
          <p className="text-sm font-semibold text-slate-600 mt-1">
            Accessible, senior-friendly family tree and oral history builder.
          </p>
        </div>

        <LoginForm onOtpRequested={handleOtpRequested} />

        <VerifyOtpModal
          isOpen={isVerifyOpen}
          onBack={() => setIsVerifyOpen(false)}
          email={authEmail || ''}
          devOtp={devOtp}
          onSuccess={handleAuthSuccess}
        />
      </div>
    );
  }

  const currentMembership = workspaces.find((w) => w.workspace.id === currentWorkspace?.id);
  const userRole = currentMembership?.role || (currentUser?.is_superadmin ? 'admin' : 'viewer');
  const isViewer = userRole === 'viewer';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header
        currentUser={currentUser}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        userRole={userRole}
        onSelectWorkspace={initWorkspaceTree}
        onCreateWorkspace={() => setIsCreateWorkspaceOpen(true)}
        onOpenMembers={() => setIsMembersOpen(true)}
        onOpenSuperAdmin={() => setIsSuperAdminOpen(true)}
        onLogout={handleLogout}
        highContrast={highContrast}
        onToggleHighContrast={handleToggleHighContrast}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Top Navigation Tabs */}
        {currentWorkspace && (
          <div className="bg-white rounded-2xl p-2 border-2 border-slate-200 shadow-sm flex items-center justify-between gap-2 overflow-x-auto">
            {/* View Mode Tabs */}
            <div className="flex items-center gap-1.5 shrink-0" role="tablist" aria-label="Main View Navigation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'focus'}
                onClick={() => setActiveTab('focus')}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'focus'
                    ? 'bg-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-400'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Compass className="w-4 h-4 stroke-[2.5]" />
                <span>Focus View</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'map'}
                onClick={() => setActiveTab('map')}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'map'
                    ? 'bg-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-400'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Network className="w-4 h-4 stroke-[2.5]" />
                <span>Bird's-Eye Map</span>
              </button>
            </div>

            {/* Action / Modal Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsActivityModalOpen(true)}
                className="px-3.5 py-2.5 rounded-xl font-bold text-sm text-slate-800 hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <History className="w-4 h-4 text-slate-600 stroke-[2.5]" />
                <span>Family Activity</span>
              </button>

              <button
                type="button"
                onClick={() => setIsTrashModalOpen(true)}
                className="px-3.5 py-2.5 rounded-xl font-bold text-sm text-slate-800 hover:bg-rose-50 hover:text-rose-900 border border-slate-200 hover:border-rose-300 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-600 stroke-[2.5]" />
                <span>Family Trash</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-sm font-semibold max-w-3xl mx-auto"
          >
            {error}
          </div>
        )}

        {treeLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        )}

        {/* Focus Person Hub View */}
        {currentWorkspace && activeTab === 'focus' && focusNeighborhood && (
          <FocusPersonView
            neighborhood={focusNeighborhood}
            isViewer={isViewer}
            onSelectPerson={handleSelectPerson}
            onAddRelative={handleOpenAddRelative}
            onEditPerson={handleOpenEditPerson}
            workspaceId={currentWorkspace.id}
          />
        )}

        {/* Multi-Generation Pedigree SVG Map View */}
        {currentWorkspace && activeTab === 'map' && (
          <BirdseyeMapCanvas
            people={allPeople}
            focusPersonId={focusNeighborhood?.focus_person.id}
            onSelectPerson={(id) => {
              handleSelectPerson(id);
              setActiveTab('focus');
            }}
            onEditPerson={!isViewer ? (p) => handleOpenEditPerson(p as PersonSummary) : undefined}
          />
        )}

        {/* Empty Tree State (Prompt to add first person) */}
        {currentWorkspace && !focusNeighborhood && !treeLoading && (
          <div className="max-w-lg mx-auto mt-12 bg-white rounded-3xl p-8 border-2 border-slate-200 shadow-lg text-center space-y-6">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto text-amber-700">
              <UserPlus className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900">Start Your Family Tree</h2>
              <p className="text-slate-600 text-sm mt-1 font-medium">
                {isViewer
                  ? 'This family tree is currently empty. A family admin or collaborator can add the initial relatives.'
                  : 'Add yourself or the oldest known relative to begin building your family history.'}
              </p>
            </div>

            {!isViewer && (
              <form onSubmit={handleCreateRootPerson} className="space-y-4 text-left">
                <div>
                  <label htmlFor="root_first_name" className="block text-sm font-bold text-slate-800 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="root_first_name"
                    name="first_name"
                    type="text"
                    required
                    placeholder="e.g. Margaret"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 text-base font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor="root_last_name" className="block text-sm font-bold text-slate-800 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="root_last_name"
                    name="last_name"
                    type="text"
                    required
                    placeholder="e.g. Miller"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 text-base font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor="root_birth_date" className="block text-sm font-bold text-slate-800 mb-1">
                    Birth Date <span className="text-xs text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="root_birth_date"
                    name="birth_date"
                    type="text"
                    placeholder="e.g. 1942-05-12 or 1942"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 text-base font-semibold"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-4 py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-base transition-colors shadow flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span>Add Root Person</span>
                </button>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Standard Add Relative Modal */}
      <AddRelativeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        relativeType={addRelativeType}
        focusPerson={focusNeighborhood?.focus_person || null}
        partners={focusNeighborhood?.partners || []}
        existingParents={focusNeighborhood?.parents || []}
        allPeople={allPeople}
        onSubmit={handleAddRelativeSubmit}
      />

      {/* Edit Person Modal */}
      <EditPersonModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingPerson(null);
          setEditingPersonRelatives(null);
        }}
        person={editingPerson}
        allPeople={allPeople}
        relatives={editingPersonRelatives}
        onSave={handleSavePersonEdit}
        onDelete={handleDeletePerson}
        onRemoveRelationship={handleRemoveRelationship}
      />

      {/* Create New Family / Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={isCreateWorkspaceOpen}
        onClose={() => setIsCreateWorkspaceOpen(false)}
        onSubmit={handleCreateWorkspace}
      />

      {/* Family Members & Roles Modal */}
      {currentWorkspace && (
        <FamilyMembersModal
          isOpen={isMembersOpen}
          onClose={() => setIsMembersOpen(false)}
          workspaceId={currentWorkspace.id}
          workspaceName={currentWorkspace.name}
          currentUserId={currentUser?.id}
        />
      )}

      {/* Super Admin Dashboard Modal */}
      <SuperAdminDashboard
        isOpen={isSuperAdminOpen}
        onClose={() => setIsSuperAdminOpen(false)}
        onSelectWorkspace={handleSelectWorkspaceFromAdmin}
      />

      {/* Activity Feed Modal */}
      {currentWorkspace && (
        <ActivityFeedModal
          isOpen={isActivityModalOpen}
          onClose={() => setIsActivityModalOpen(false)}
          workspaceId={currentWorkspace.id}
        />
      )}

      {/* Trash Recovery Modal */}
      {currentWorkspace && (
        <TrashCanModal
          isOpen={isTrashModalOpen}
          onClose={() => setIsTrashModalOpen(false)}
          workspaceId={currentWorkspace.id}
          onRestored={handleTrashRestored}
        />
      )}
    </div>
  );
};

export default App;
