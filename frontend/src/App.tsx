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
  TreeEdge,
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
import { DataBackupModal } from './components/workspace/DataBackupModal';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { LoginForm } from './components/auth/LoginForm';
import { VerifyOtpModal } from './components/auth/VerifyOtpModal';
import {
  Plus,
  Loader2,
  Compass,
  Network,
  History,
  Trash2,
  TreePine,
  Sparkles,
  BookOpen,
  ShieldCheck,
  Heart,
  Lock,
  Github,
} from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserRead | null>(null);
  const [workspaces, setWorkspaces] = useState<UserWorkspaceMembership[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceRead | null>(null);
  const [focusNeighborhood, setFocusNeighborhood] = useState<FocusNeighborhoodResponse | null>(null);
  const [allPeople, setAllPeople] = useState<PersonRead[]>([]);
  const [treeEdges, setTreeEdges] = useState<TreeEdge[]>([]);
  const [serverMapPositions, setServerMapPositions] = useState<Record<string, { x: number; y: number }>>({});
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
  const [isDataBackupOpen, setIsDataBackupOpen] = useState(false);
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

  // Re-fetch overview edges and map layout whenever map view is opened
  useEffect(() => {
    if (currentWorkspace && activeTab === 'map') {
      api.tree
        .getOverview(currentWorkspace.id)
        .then((overview) => {
          setTreeEdges(overview.edges);
        })
        .catch(() => {});

      api.workspaces
        .getMapLayout(currentWorkspace.id)
        .then((layout) => {
          setServerMapPositions(layout.positions || {});
        })
        .catch(() => {});
    }
  }, [currentWorkspace, activeTab]);

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
        const [people, overview, mapLayout] = await Promise.all([
          api.people.list(workspace.id, { limit: 100 }),
          api.tree.getOverview(workspace.id),
          api.workspaces.getMapLayout(workspace.id).catch(() => ({ positions: {} })),
        ]);
        setAllPeople(people);
        setTreeEdges(overview.edges);
        setServerMapPositions(mapLayout.positions || {});
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
      const [people, overview] = await Promise.all([
        api.people.list(currentWorkspace.id, { limit: 100 }),
        api.tree.getOverview(currentWorkspace.id),
      ]);
      setAllPeople(people);
      setTreeEdges(overview.edges);
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
      setTreeEdges([]);
    } finally {
      setLoading(false);
    }
  }, [initWorkspaceTree]);

  // Check auth state on mount and inspect URL query parameters & hash fragment
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check hash fragment for OAuth session token (#token=...)
      if (window.location.hash) {
        const hashRaw = window.location.hash.startsWith('#')
          ? window.location.hash.substring(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hashRaw);
        const hashToken = hashParams.get('token');
        if (hashToken) {
          tokenStorage.set(hashToken);
          hashParams.delete('token');
          const remainingHash = hashParams.toString() ? `#${hashParams.toString()}` : '';
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname + window.location.search + remainingHash
          );
          loadUserData();
          return;
        }
      }

      if (window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        const urlError = params.get('error');

        if (urlToken) {
          tokenStorage.set(urlToken);
          params.delete('token');
          const remainingSearch = params.toString() ? `?${params.toString()}` : '';
          window.history.replaceState({}, document.title, window.location.pathname + remainingSearch);
          loadUserData();
          return;
        }

        if (urlError) {
          params.delete('error');
          const remainingSearch = params.toString() ? `?${params.toString()}` : '';
          window.history.replaceState({}, document.title, window.location.pathname + remainingSearch);
          const decodedError = decodeURIComponent(urlError);
          setError(
            decodedError.startsWith('google_auth_failed') ||
            decodedError.startsWith('invalid_state') ||
            decodedError.startsWith('google_exchange_failed')
              ? `Google Sign-In error: ${decodedError}. Please try again or use email.`
              : decodedError
          );
        }
      }
    }

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
    setTreeEdges([]);
  };

  // Auth callbacks
  const handleOtpRequested = (email: string) => {
    setAuthEmail(email);
    setIsVerifyOpen(true);
  };

  const handleAuthSuccess = () => {
    setIsVerifyOpen(false);
    setAuthEmail(null);
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

  // Handle data import success from backup modal
  const handleImportSuccess = async () => {
    if (!currentWorkspace) return;
    try {
      const [people, overview] = await Promise.all([
        api.people.list(currentWorkspace.id, { limit: 100 }),
        api.tree.getOverview(currentWorkspace.id),
      ]);
      setAllPeople(people);
      setTreeEdges(overview.edges);
      if (focusNeighborhood) {
        await loadFocusNeighborhood(currentWorkspace.id, focusNeighborhood.focus_person.id);
      } else if (people.length > 0) {
        await loadFocusNeighborhood(currentWorkspace.id, people[0].id);
      }
    } catch {
      // Ignore background refresh errors
    }
  };

  // Create new workspace handler
  const handleCreateWorkspace = async (name: string, description?: string) => {
    const newWs = await api.workspaces.create({ name, description });
    const userWorkspaces = await api.workspaces.list();
    setWorkspaces(userWorkspaces);
    await initWorkspaceTree(newWs);
  };

  // Workspace metadata updated handler
  const handleWorkspaceUpdated = (updated: WorkspaceRead) => {
    setCurrentWorkspace(updated);
    setWorkspaces((prev) =>
      prev.map((item) =>
        item.workspace.id === updated.id ? { ...item, workspace: updated } : item
      )
    );
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

    if (!firstName) return;

    setTreeLoading(true);
    try {
      const newPerson = await api.people.create(currentWorkspace.id, {
        first_name: firstName,
        last_name: lastName || undefined,
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

  // Save custom map layout positions
  const handleSaveMapPositions = async (positions: Record<string, { x: number; y: number }>) => {
    if (!currentWorkspace) return;
    try {
      await api.workspaces.updateMapLayout(currentWorkspace.id, positions);
      setServerMapPositions(positions);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  // Reset custom map layout positions to auto-layout
  const handleResetMapPositions = async () => {
    if (!currentWorkspace) return;
    try {
      await api.workspaces.resetMapLayout(currentWorkspace.id);
      setServerMapPositions({});
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
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
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-amber-200">
        {/* Top Public Header */}
        <header className="w-full border-b-2 border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-sm ring-2 ring-amber-300">
                <TreePine className="w-6 h-6 stroke-[2.4]" />
              </div>
              <div>
                <span className="text-xl font-black tracking-tight text-slate-900 leading-none block">
                  Lores
                </span>
                <span className="text-2xs font-extrabold uppercase tracking-wider text-amber-700 block mt-0.5">
                  Family History & Oral Lore
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <a
                href="https://github.com/prashmohan/lores"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 text-xs font-bold text-slate-800 transition-colors shadow-2xs min-h-[36px]"
                title="View Lores Open Source Repository on GitHub (opens in new tab)"
                aria-label="View Open Source Repository on GitHub (opens in new tab)"
              >
                <Github className="w-4 h-4 text-slate-800" />
                <span className="hidden xs:inline">GitHub</span>
              </a>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>100% Private</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-extrabold text-amber-900">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>WCAG 2.1 AAA</span>
              </div>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Hero Column */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100/80 border border-amber-300 text-amber-950 text-xs font-extrabold shadow-2xs">
                <Sparkles className="w-4 h-4 text-amber-700" />
                <span>Simple, Welcoming & Private • For Every Generation</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-950 tracking-tight leading-[1.1]">
                Preserve your family history & oral stories, <span className="text-amber-600 underline decoration-amber-300 decoration-wavy decoration-2">together</span>.
              </h1>

              <p className="text-base sm:text-lg text-slate-700 font-medium leading-relaxed max-w-2xl">
                Lores is an accessible family tree and storytelling archive engineered so every family member can record authentic voices, organize relationships without confusing charts, and safeguard ancestral memories.
              </p>

              {/* Value Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border-2 border-slate-200 shadow-xs">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Compass className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">1-Hop Focus Navigation</h2>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Explore one person at a time with clear, legible cards.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border-2 border-slate-200 shadow-xs">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                    <BookOpen className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">Oral Lore & Stories</h2>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Attach voices, anecdotes, and recipes directly to relatives.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border-2 border-slate-200 shadow-xs">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Lock className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">Living Privacy Protection</h2>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Living relatives are automatically redacted for guest viewers.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border-2 border-slate-200 shadow-xs">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 mt-0.5">
                    <History className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">30-Day Recovery Safety Net</h2>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      1-click restore for any deleted family member or story.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Hero Column: Auth Form */}
            <div className="lg:col-span-5 flex justify-center">
              <LoginForm
                onOtpRequested={handleOtpRequested}
                onLoginSuccess={loadUserData}
                initialError={error}
              />
            </div>
          </div>

          {/* Visual Showcase Graphic */}
          <div className="bg-linear-to-b from-white to-slate-100/80 rounded-3xl p-6 sm:p-10 border-2 border-slate-200 shadow-md space-y-6">
            <div className="text-center max-w-2xl mx-auto">
              <span className="text-xs font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-3 py-1 rounded-full border border-amber-200 inline-block mb-2">
                Intuitive Architecture
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Designed for clarity, comfort, and connection
              </h2>
              <p className="text-sm text-slate-600 mt-2 font-medium">
                Unlike traditional genealogy tools with overwhelming charts and tiny text, Lores displays families in a clean, human-centered neighborhood hub.
              </p>
            </div>

            {/* Graphic Illustration Diagram */}
            <div className="max-w-3xl mx-auto bg-slate-50/90 rounded-2xl p-6 border-2 border-slate-200/90 shadow-inner">
              <div className="flex flex-col items-center gap-4">
                {/* Parents preview */}
                <div className="flex gap-4 items-center">
                  <div className="bg-white border-2 border-blue-200 rounded-xl px-4 py-2 text-center shadow-xs">
                    <span className="text-2xs font-extrabold uppercase text-blue-700">Father</span>
                    <p className="text-xs font-bold text-slate-900">Arthur Miller</p>
                    <p className="text-2xs text-slate-500">1915 — 2005</p>
                  </div>
                  <div className="w-6 h-0.5 bg-blue-300" />
                  <div className="bg-white border-2 border-blue-200 rounded-xl px-4 py-2 text-center shadow-xs">
                    <span className="text-2xs font-extrabold uppercase text-blue-700">Mother</span>
                    <p className="text-xs font-bold text-slate-900">Eleanor Vance</p>
                    <p className="text-2xs text-slate-500">1918 — 2012</p>
                  </div>
                </div>

                {/* Middle focus row */}
                <div className="flex flex-wrap items-center justify-center gap-4 w-full">
                  <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-center shadow-xs">
                    <span className="text-2xs font-bold uppercase text-slate-500">Sibling</span>
                    <p className="text-xs font-bold text-slate-800">Robert Miller</p>
                    <p className="text-2xs text-slate-500">b. 1945</p>
                  </div>

                  <div className="h-0.5 w-6 bg-slate-300 hidden sm:block" />

                  {/* Focus Card */}
                  <div className="bg-amber-50 border-2 border-amber-500 ring-4 ring-amber-200 rounded-2xl p-4 text-center shadow-md min-w-[200px]">
                    <span className="text-2xs font-black uppercase tracking-wider text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full">
                      Focus Person
                    </span>
                    <p className="text-base font-extrabold text-slate-950 mt-1">Margaret Miller</p>
                    <p className="text-xs text-amber-900 font-semibold">b. 1942 • Boston, MA</p>
                    <div className="mt-2 text-2xs bg-white text-slate-700 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center justify-center gap-1 font-medium">
                      <BookOpen className="w-3 h-3 text-amber-600" />
                      <span>3 Stories Attached</span>
                    </div>
                  </div>

                  <div className="h-0.5 w-6 bg-rose-300 hidden sm:block" />

                  <div className="bg-white border-2 border-rose-200 rounded-xl px-3.5 py-2 text-center shadow-xs">
                    <div className="flex items-center justify-center gap-1">
                      <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                      <span className="text-2xs font-extrabold uppercase text-rose-700">Spouse</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800">George Vance</p>
                    <p className="text-2xs text-slate-500">1940 — 2018</p>
                  </div>
                </div>

                {/* Children preview */}
                <div className="flex gap-4 items-center">
                  <div className="bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-center shadow-xs">
                    <span className="text-2xs font-extrabold uppercase text-emerald-700">Child</span>
                    <p className="text-xs font-bold text-slate-900">Ronald Vance</p>
                    <p className="text-2xs text-slate-500">b. 1968</p>
                  </div>
                  <div className="bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-center shadow-xs">
                    <span className="text-2xs font-extrabold uppercase text-emerald-700">Child</span>
                    <p className="text-xs font-bold text-slate-900">Clara Vance</p>
                    <p className="text-2xs text-slate-500">b. 1972</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Three Feature Highlight Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-300">
                <Compass className="w-6 h-6 stroke-[2.4]" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">1-Hop Focus Neighborhood</h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Step through your family story without getting lost in overwhelming multi-branch canvas diagrams. Every person is the center of their own circle.
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-300">
                <BookOpen className="w-6 h-6 stroke-[2.4]" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">Oral History & Lore Notes</h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Record family memories, audio lore, milestone events, and cultural heritage so the human spirit of your lineage lives on for future generations.
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center border border-blue-300">
                <Network className="w-6 h-6 stroke-[2.4]" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">Bird's-Eye SVG Map</h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Zoom out to see your complete multi-generational pedigree chart anytime with smooth SVG pan and zoom, partner indicators, and exportable views.
              </p>
            </div>
          </div>
        </main>

        {/* Public Footer */}
        <footer className="w-full border-t-2 border-slate-200 bg-white py-8 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500">
            <div className="flex items-center gap-2">
              <TreePine className="w-4 h-4 text-amber-600" />
              <span>Lores — Accessible, Multi-Tenant Family Tree & Oral Lore Archive</span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/prashmohan/lores"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-950 font-bold transition-colors underline decoration-slate-300 hover:decoration-slate-900"
                aria-label="View Open Source Repository on GitHub (opens in new tab)"
              >
                <Github className="w-4 h-4" />
                <span>GitHub Repository</span>
              </a>
              <span>•</span>
              <span>MIT License</span>
            </div>
          </div>
        </footer>

        <VerifyOtpModal
          isOpen={isVerifyOpen}
          onBack={() => setIsVerifyOpen(false)}
          email={authEmail || ''}
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
        onOpenDataBackup={() => setIsDataBackupOpen(true)}
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
                className={`min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
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
                className={`min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
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
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl font-bold text-sm text-slate-800 hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <History className="w-4 h-4 text-slate-600 stroke-[2.5]" />
                <span>Family Activity</span>
              </button>

              {!isViewer && (
                <button
                  type="button"
                  onClick={() => setIsTrashModalOpen(true)}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl font-bold text-sm text-slate-800 hover:bg-rose-50 hover:text-rose-900 border border-slate-200 hover:border-rose-300 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-rose-600 stroke-[2.5]" />
                  <span>Family Trash</span>
                </button>
              )}
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
            onEditPhoto={!isViewer ? handleOpenEditPerson : undefined}
            workspaceId={currentWorkspace.id}
          />
        )}

        {/* Multi-Generation Pedigree SVG Map View */}
        {currentWorkspace && activeTab === 'map' && (
          <BirdseyeMapCanvas
            people={allPeople}
            edges={treeEdges}
            focusPersonId={focusNeighborhood?.focus_person.id}
            workspaceId={currentWorkspace.id}
            serverPositions={serverMapPositions}
            canEdit={!isViewer}
            onSelectPerson={(id) => {
              handleSelectPerson(id);
              setActiveTab('focus');
            }}
            onEditPerson={!isViewer ? (p) => handleOpenEditPerson(p as PersonSummary) : undefined}
            onSavePositions={!isViewer ? handleSaveMapPositions : undefined}
            onResetPositions={!isViewer ? handleResetMapPositions : undefined}
          />
        )}

        {/* Empty Tree State (Prompt to add first person) */}
        {currentWorkspace && !focusNeighborhood && !treeLoading && (
          <div className="max-w-xl mx-auto mt-10 bg-white rounded-3xl p-8 sm:p-10 border-2 border-slate-200/90 shadow-xl text-center space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-amber-400 via-amber-500 to-amber-600" />

            <div className="w-16 h-16 bg-amber-50 border-2 border-amber-200 rounded-2xl flex items-center justify-center mx-auto text-amber-700 shadow-xs">
              <TreePine className="w-8 h-8 stroke-[2.2]" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Begin Your Family Tree</h2>
              <p className="text-slate-600 text-sm font-medium max-w-md mx-auto">
                {isViewer
                  ? 'This family tree is currently empty. A family admin or collaborator can add the initial relatives.'
                  : 'Add yourself or an elder relative to start recording your family lineage and lore.'}
              </p>
            </div>

            {!isViewer && (
              <form onSubmit={handleCreateRootPerson} className="space-y-4 text-left pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="root_first_name" className="block text-sm font-bold text-slate-900 mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="root_first_name"
                      name="first_name"
                      type="text"
                      required
                      placeholder="e.g. Margaret"
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 text-base font-semibold transition-all outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="root_last_name" className="block text-sm font-bold text-slate-900 mb-1">
                      Last Name <span className="text-xs text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="root_last_name"
                      name="last_name"
                      type="text"
                      placeholder="e.g. Miller"
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 text-base font-semibold transition-all outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="root_birth_date" className="block text-sm font-bold text-slate-900 mb-1">
                    Birth Date / Year <span className="text-xs text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="root_birth_date"
                    name="birth_date"
                    type="text"
                    placeholder="e.g. 1942 or 12 Apr 1942"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 text-base font-semibold transition-all outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-4 py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-black text-base transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span>Add First Relative & Start Tree</span>
                </button>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Authenticated Bottom Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white/60 py-3 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-2xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <TreePine className="w-3.5 h-3.5 text-amber-600" />
            <span>Lores Family Tree</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/prashmohan/lores"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-950 font-semibold transition-colors"
              aria-label="View Open Source Repository on GitHub (opens in new tab)"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Open Source on GitHub</span>
            </a>
            <span>•</span>
            <span>MIT License</span>
          </div>
        </div>
      </footer>

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
          workspaceDescription={currentWorkspace.description}
          currentUserId={currentUser?.id}
          onWorkspaceUpdated={handleWorkspaceUpdated}
        />
      )}

      {/* Data Export and Import Backup Modal */}
      {currentWorkspace && (
        <DataBackupModal
          isOpen={isDataBackupOpen}
          onClose={() => setIsDataBackupOpen(false)}
          workspaceId={currentWorkspace.id}
          workspaceName={currentWorkspace.name}
          onImportSuccess={handleImportSuccess}
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
          isViewer={isViewer}
        />
      )}

      {/* Trash Recovery Modal */}
      {currentWorkspace && !isViewer && (
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
