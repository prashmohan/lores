import React, { useState, useEffect, useCallback } from 'react';
import { api, tokenStorage, ApiError } from './lib/api';
import type {
  UserRead,
  UserWorkspaceMembership,
  WorkspaceRead,
  FocusNeighborhoodResponse,
  PersonCreate,
  PersonRead,
} from './types/api';
import { Header } from './components/layout/Header';
import { BreadcrumbBar, type BreadcrumbItem } from './components/layout/BreadcrumbBar';
import { FocusPersonView, type RelativeType } from './components/tree/FocusPersonView';
import { AddRelativeModal } from './components/tree/AddRelativeModal';
import { GuidedInterviewModal, type GuidedInterviewData } from './components/interview/GuidedInterviewModal';
import { BirdseyeMapCanvas } from './components/map/BirdseyeMapCanvas';
import { ActivityFeedModal } from './components/history/ActivityFeedModal';
import { TrashCanModal } from './components/history/TrashCanModal';
import { LoginForm } from './components/auth/LoginForm';
import { VerifyOtpModal } from './components/auth/VerifyOtpModal';
import { UserPlus, Plus, Loader2, Compass, Network, Sparkles, History, Trash2 } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserRead | null>(null);
  const [workspaces, setWorkspaces] = useState<UserWorkspaceMembership[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceRead | null>(null);
  const [focusNeighborhood, setFocusNeighborhood] = useState<FocusNeighborhoodResponse | null>(null);
  const [focusHistory, setFocusHistory] = useState<BreadcrumbItem[]>([]);
  const [allPeople, setAllPeople] = useState<PersonRead[]>([]);
  const [highContrast, setHighContrast] = useState(false);

  // Active view tab: 'focus' or 'map'
  const [activeTab, setActiveTab] = useState<'focus' | 'map'>('focus');

  // Auth flow states
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  // Modal states
  const [addRelativeType, setAddRelativeType] = useState<RelativeType | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toggle high-contrast mode class on HTML body
  const handleToggleHighContrast = () => {
    setHighContrast((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('high-contrast');
      } else {
        document.documentElement.classList.remove('high-contrast');
      }
      return next;
    });
  };

  // Fetch focus neighborhood for a person
  const loadFocusNeighborhood = useCallback(
    async (workspaceId: string, personId: string, addToHistory = true) => {
      setTreeLoading(true);
      setError(null);
      try {
        const data = await api.tree.getFocusNeighborhood(workspaceId, personId);
        setFocusNeighborhood(data);

        if (addToHistory) {
          const fullName = `${data.focus_person.first_name} ${data.focus_person.last_name}`;
          setFocusHistory((prev) => {
            if (prev.length > 0 && prev[prev.length - 1].id === personId) {
              return prev;
            }
            return [...prev, { id: personId, name: fullName }];
          });
        }
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
      setFocusHistory([]);
      setError(null);

      try {
        const people = await api.people.list(workspace.id, { limit: 100 });
        setAllPeople(people);
        if (people.length > 0) {
          await loadFocusNeighborhood(workspace.id, people[0].id, true);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        }
      }
    },
    [loadFocusNeighborhood]
  );

  // Refresh people list
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
      setFocusHistory([]);
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
    setFocusHistory([]);
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
    loadFocusNeighborhood(currentWorkspace.id, personId, true);
  };

  // Jump to breadcrumb
  const handleBreadcrumbClick = (personId: string) => {
    if (!currentWorkspace) return;
    const targetIdx = focusHistory.findIndex((b) => b.id === personId);
    if (targetIdx !== -1) {
      setFocusHistory((prev) => prev.slice(0, targetIdx + 1));
      loadFocusNeighborhood(currentWorkspace.id, personId, false);
    }
  };

  // Reset focus to root
  const handleResetFocus = () => {
    if (focusHistory.length > 0 && currentWorkspace) {
      const rootPerson = focusHistory[0];
      setFocusHistory([rootPerson]);
      loadFocusNeighborhood(currentWorkspace.id, rootPerson.id, false);
    }
  };

  // Open add relative modal
  const handleOpenAddRelative = (type: RelativeType) => {
    setAddRelativeType(type);
    setIsAddModalOpen(true);
  };

  // Submit new relative via form modal
  const handleAddRelativeSubmit = async (type: RelativeType, personData: PersonCreate) => {
    if (!currentWorkspace || !focusNeighborhood) return;
    await api.tree.addRelative(currentWorkspace.id, {
      relative_type: type,
      base_person_id: focusNeighborhood.focus_person.id,
      person_data: personData,
    });

    await refreshPeopleList();
    await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id, false);
  };

  // Submit new relative via guided conversational interview
  const handleGuidedInterviewSubmit = async (data: GuidedInterviewData) => {
    if (!currentWorkspace || !focusNeighborhood) return;
    await api.tree.addRelative(currentWorkspace.id, {
      relative_type: data.relative_type,
      base_person_id: focusNeighborhood.focus_person.id,
      person_data: {
        first_name: data.first_name,
        last_name: data.last_name,
        maiden_name: data.maiden_name,
        birth_date: data.birth_date,
        birth_place: data.birth_place,
        is_living: data.is_living,
        death_date: data.death_date,
        death_place: data.death_place,
      },
    });

    await refreshPeopleList();
    await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id, false);
  };

  // Handle restore event from trash modal
  const handleTrashRestored = async () => {
    if (!currentWorkspace) return;
    await refreshPeopleList();
    if (focusNeighborhood) {
      await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id, false);
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
      await loadFocusNeighborhood(currentWorkspace.id, newPerson.id, true);
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
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
        <LoginForm onOtpRequested={handleOtpRequested} />
        {isVerifyOpen && authEmail && (
          <VerifyOtpModal
            isOpen={isVerifyOpen}
            email={authEmail}
            devOtp={devOtp}
            onSuccess={handleAuthSuccess}
            onBack={() => setIsVerifyOpen(false)}
          />
        )}
      </div>
    );
  }

  const focusPersonName = focusNeighborhood
    ? `${focusNeighborhood.focus_person.first_name} ${focusNeighborhood.focus_person.last_name}`
    : 'Selected Person';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header
        currentUser={currentUser}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onSelectWorkspace={initWorkspaceTree}
        onLogout={handleLogout}
        highContrast={highContrast}
        onToggleHighContrast={handleToggleHighContrast}
      />

      <BreadcrumbBar
        history={focusHistory}
        onSelectPerson={handleBreadcrumbClick}
        onReset={handleResetFocus}
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
                onClick={() => setIsInterviewModalOpen(true)}
                disabled={!focusNeighborhood}
                className="px-3.5 py-2.5 rounded-xl font-bold text-sm text-slate-800 hover:bg-amber-50 hover:text-amber-900 border border-slate-200 hover:border-amber-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4 text-amber-600 stroke-[2.5]" />
                <span>Guided Interview</span>
              </button>

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

        {/* View Mode: Focus View */}
        {!treeLoading && activeTab === 'focus' && focusNeighborhood && (
          <FocusPersonView
            data={focusNeighborhood}
            onSelectPerson={handleSelectPerson}
            onAddRelative={handleOpenAddRelative}
          />
        )}

        {/* View Mode: Bird's-Eye Map */}
        {!treeLoading && activeTab === 'map' && (
          <BirdseyeMapCanvas
            people={allPeople.length > 0 ? allPeople : focusNeighborhood ? [focusNeighborhood.focus_person, ...focusNeighborhood.parents, ...focusNeighborhood.partners, ...focusNeighborhood.children, ...focusNeighborhood.siblings] : []}
            focusPersonId={focusNeighborhood?.focus_person.id}
            onSelectPerson={handleSelectPerson}
          />
        )}

        {/* Empty State */}
        {!treeLoading && !focusNeighborhood && allPeople.length === 0 && (
          <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border-2 border-slate-200 text-center shadow-lg">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-300">
              <UserPlus className="w-8 h-8 text-amber-700" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">
              Start Your Family Tree
            </h2>
            <p className="text-slate-600 text-sm mb-6">
              Add the first person to begin building and exploring your lineage.
            </p>

            <form onSubmit={handleCreateRootPerson} className="space-y-4 text-left">
              <div>
                <label htmlFor="root_first_name" className="block text-sm font-bold text-slate-800 mb-1">
                  First Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="root_first_name"
                  name="first_name"
                  type="text"
                  required
                  placeholder="e.g. Margaret"
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                />
              </div>

              <div>
                <label htmlFor="root_last_name" className="block text-sm font-bold text-slate-800 mb-1">
                  Last Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="root_last_name"
                  name="last_name"
                  type="text"
                  required
                  placeholder="e.g. Miller"
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                />
              </div>

              <div>
                <label htmlFor="root_birth_date" className="block text-sm font-bold text-slate-800 mb-1">
                  Birth Year / Date
                </label>
                <input
                  id="root_birth_date"
                  name="birth_date"
                  type="text"
                  placeholder="e.g. 1942"
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
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
          </div>
        )}
      </main>

      {/* Standard Add Relative Modal */}
      <AddRelativeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        relativeType={addRelativeType}
        focusPerson={focusNeighborhood?.focus_person || null}
        onSubmit={handleAddRelativeSubmit}
      />

      {/* Guided Conversational Interview Modal */}
      <GuidedInterviewModal
        isOpen={isInterviewModalOpen}
        onClose={() => setIsInterviewModalOpen(false)}
        basePersonName={focusPersonName}
        onSubmit={handleGuidedInterviewSubmit}
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
