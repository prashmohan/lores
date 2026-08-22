import React, { useState, useEffect, useCallback } from 'react';
import { api, tokenStorage, ApiError } from './lib/api';
import type {
  UserRead,
  UserWorkspaceMembership,
  WorkspaceRead,
  FocusNeighborhoodResponse,
  PersonCreate,
} from './types/api';
import { Header } from './components/layout/Header';
import { BreadcrumbBar, type BreadcrumbItem } from './components/layout/BreadcrumbBar';
import { FocusPersonView, type RelativeType } from './components/tree/FocusPersonView';
import { AddRelativeModal } from './components/tree/AddRelativeModal';
import { LoginForm } from './components/auth/LoginForm';
import { VerifyOtpModal } from './components/auth/VerifyOtpModal';
import { UserPlus, Plus, Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserRead | null>(null);
  const [workspaces, setWorkspaces] = useState<UserWorkspaceMembership[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceRead | null>(null);
  const [focusNeighborhood, setFocusNeighborhood] = useState<FocusNeighborhoodResponse | null>(null);
  const [focusHistory, setFocusHistory] = useState<BreadcrumbItem[]>([]);
  const [highContrast, setHighContrast] = useState(false);

  // Auth flow states
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  // Tree mutation modal
  const [addRelativeType, setAddRelativeType] = useState<RelativeType | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
            // If already at top of history, don't duplicate
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
        const people = await api.people.list(workspace.id, { limit: 10 });
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
      // Token invalid or unauthenticated
      tokenStorage.clear();
      setCurrentUser(null);
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setFocusNeighborhood(null);
      setFocusHistory([]);
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

  // Submit new relative
  const handleAddRelativeSubmit = async (type: RelativeType, personData: PersonCreate) => {
    if (!currentWorkspace || !focusNeighborhood) return;
    await api.tree.addRelative(currentWorkspace.id, {
      relative_type: type,
      base_person_id: focusNeighborhood.focus_person.id,
      person_data: personData,
    });

    // Refresh current focus neighborhood to show new relative immediately
    await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id, false);
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

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-sm font-semibold max-w-3xl mx-auto"
          >
            {error}
          </div>
        )}

        {treeLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        )}

        {!treeLoading && focusNeighborhood && (
          <FocusPersonView
            data={focusNeighborhood}
            onSelectPerson={handleSelectPerson}
            onAddRelative={handleOpenAddRelative}
          />
        )}

        {!treeLoading && !focusNeighborhood && (
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

      <AddRelativeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        relativeType={addRelativeType}
        focusPerson={focusNeighborhood?.focus_person || null}
        onSubmit={handleAddRelativeSubmit}
      />
    </div>
  );
};

export default App;
