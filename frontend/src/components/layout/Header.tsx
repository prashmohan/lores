import React, { useState, useEffect, useRef } from 'react';
import { TreePine, Sun, Moon, LogOut, ChevronDown, User as UserIcon, Plus, ShieldAlert, Users, Database, Menu, X, Github } from 'lucide-react';
import type { UserRead, UserWorkspaceMembership, WorkspaceRead } from '../../types/api';

interface HeaderProps {
  currentUser: UserRead | null;
  workspaces: UserWorkspaceMembership[];
  currentWorkspace: WorkspaceRead | null;
  userRole?: string | null;
  onSelectWorkspace: (workspace: WorkspaceRead) => void;
  onCreateWorkspace?: () => void;
  onOpenMembers?: () => void;
  onOpenDataBackup?: () => void;
  onOpenSuperAdmin?: () => void;
  onLogout: () => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  workspaces,
  currentWorkspace,
  userRole,
  onSelectWorkspace,
  onCreateWorkspace,
  onOpenMembers,
  onOpenDataBackup,
  onOpenSuperAdmin,
  onLogout,
  highContrast,
  onToggleHighContrast,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const canManageMembers = userRole === 'admin' || userRole === 'owner' || currentUser?.is_superadmin;
  const canManageData = userRole === 'admin' || userRole === 'owner' || currentUser?.is_superadmin;

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  return (
    <header ref={headerRef} className="bg-white border-b-2 border-slate-200 px-3 sm:px-8 py-2 sm:py-3 sticky top-0 z-30 shadow-sm relative">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4 h-11 sm:h-12">
        {/* Brand & Workspace Controls */}
        <div className="flex items-center gap-2 sm:gap-6 min-w-0 flex-nowrap">
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-sm shrink-0">
              <TreePine className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 leading-none block">
                Lores
              </span>
              <span className="hidden sm:block text-2xs font-bold uppercase tracking-wider text-slate-500">
                Family Tree
              </span>
            </div>
          </div>

          {/* Workspace Switcher & Create Button */}
          {workspaces.length > 0 && currentWorkspace && (
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
              <div className="relative inline-flex items-center min-w-0 max-w-[130px] sm:max-w-[180px] lg:max-w-[220px]">
                <label htmlFor="workspace-select" className="sr-only">
                  Select Workspace
                </label>
                <select
                  id="workspace-select"
                  value={currentWorkspace.id}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      if (onCreateWorkspace) onCreateWorkspace();
                      return;
                    }
                    const selected = workspaces.find((w) => w.workspace.id === e.target.value);
                    if (selected) {
                      onSelectWorkspace(selected.workspace);
                    }
                  }}
                  className="w-full appearance-none bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 text-slate-900 font-bold text-xs sm:text-sm rounded-xl pl-2.5 sm:pl-3 pr-7 sm:pr-8 py-1.5 sm:py-2 cursor-pointer focus:border-amber-500 transition-colors truncate"
                >
                  {workspaces.map((item) => (
                    <option key={item.workspace.id} value={item.workspace.id}>
                      {item.workspace.name} ({item.role})
                    </option>
                  ))}
                  <option value="__NEW__">+ Create New Family...</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 absolute right-2 pointer-events-none" />
              </div>

              {onCreateWorkspace && (
                <button
                  type="button"
                  onClick={onCreateWorkspace}
                  title="Create New Family Tree"
                  aria-label="Create New Family Tree"
                  className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-amber-100 hover:text-amber-900 border-2 border-slate-300 hover:border-amber-400 text-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden xl:inline">New Family</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Desktop Controls: Members + Super Admin + High Contrast + User Profile */}
        <div className="hidden sm:flex items-center gap-2 sm:gap-3">
          {/* Family Members Management Trigger (Admins only) */}
          {canManageMembers && onOpenMembers && currentWorkspace && (
            <button
              type="button"
              onClick={onOpenMembers}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs min-h-[40px]"
              title="Manage Family Members & Roles"
              aria-label="Manage Family Members"
            >
              <Users className="w-4 h-4 text-slate-700" />
              <span>Members</span>
            </button>
          )}

          {/* Data & Backup Trigger (Admins only) */}
          {canManageData && onOpenDataBackup && currentWorkspace && (
            <button
              type="button"
              onClick={onOpenDataBackup}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs min-h-[40px]"
              title="Export and Import Family Tree Data (Admins Only)"
              aria-label="Manage Family Data and Backup"
            >
              <Database className="w-4 h-4 text-slate-700" />
              <span>Data & Backup</span>
            </button>
          )}

          {/* Super Admin Dashboard Trigger */}
          {currentUser?.is_superadmin && onOpenSuperAdmin && (
            <button
              type="button"
              onClick={onOpenSuperAdmin}
              className="px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 border-2 border-amber-300 text-amber-900 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs min-h-[40px]"
              title="Open Super Admin Dashboard"
              aria-label="Open Super Admin Dashboard"
            >
              <ShieldAlert className="w-4 h-4 text-amber-800" />
              <span>Super Admin</span>
            </button>
          )}

          {/* Open Source GitHub Repository Link */}
          <a
            href="https://github.com/prashmohan/lores"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border-2 border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[40px] min-w-[40px]"
            title="View Open Source Repository on GitHub (opens in new tab)"
            aria-label="View Open Source Repository on GitHub (opens in new tab)"
          >
            <Github className="w-4 h-4 text-slate-700" />
            <span className="hidden xl:inline">GitHub</span>
          </a>

          {/* High Contrast Toggle */}
          <button
            type="button"
            onClick={onToggleHighContrast}
            className={`px-3 py-2 rounded-xl border-2 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors min-h-[40px] ${
              highContrast
                ? 'bg-amber-500 text-slate-950 border-slate-900 shadow-sm'
                : 'bg-slate-50 border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-950'
            }`}
            title="Toggle High Contrast Mode (WCAG AAA)"
            aria-label="Toggle High Contrast Mode"
          >
            {highContrast ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden md:inline">{highContrast ? 'High Contrast: ON' : 'High Contrast'}</span>
          </button>

          {/* User Info & Logout */}
          {currentUser && (
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l-2 border-slate-200">
              <div className="flex items-center gap-2 text-left">
                <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-sm">
                  {currentUser.display_name ? currentUser.display_name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">
                    {currentUser.display_name || currentUser.email}
                  </p>
                  <p className="text-2xs text-slate-500 truncate max-w-[120px]">
                    {currentUser.email}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="p-2 rounded-xl text-slate-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
                title="Log Out"
                aria-label="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Navigation Menu Toggle Button (< sm viewports) */}
        <div className="flex sm:hidden items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Open mobile navigation menu"
            aria-expanded={mobileMenuOpen}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 text-slate-800 transition-colors cursor-pointer"
            title="Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Dropdown Menu */}
      {mobileMenuOpen && (
        <div
          data-testid="mobile-nav-menu"
          className="sm:hidden absolute top-full left-0 right-0 bg-white border-b-2 border-slate-200 shadow-2xl p-4 flex flex-col gap-3 z-40 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Mobile User Card */}
          {currentUser && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-sm shrink-0">
                {currentUser.display_name ? currentUser.display_name.charAt(0).toUpperCase() : <UserIcon className="w-5 h-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 leading-tight truncate">
                  {currentUser.display_name || currentUser.email}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {currentUser.email}
                </p>
              </div>
            </div>
          )}

          {/* Secondary Actions with >= 44px touch targets */}
          <div className="flex flex-col gap-2 pt-1">
            {canManageMembers && onOpenMembers && currentWorkspace && (
              <button
                type="button"
                data-testid="mobile-menu-members"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenMembers();
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 text-slate-800 font-bold text-sm flex items-center gap-3 cursor-pointer transition-colors"
                aria-label="Manage Family Members"
              >
                <Users className="w-5 h-5 text-slate-700 shrink-0" />
                <span>Manage Members</span>
              </button>
            )}

            {canManageData && onOpenDataBackup && currentWorkspace && (
              <button
                type="button"
                data-testid="mobile-menu-data-backup"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenDataBackup();
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 text-slate-800 font-bold text-sm flex items-center gap-3 cursor-pointer transition-colors"
                aria-label="Manage Family Data and Backup"
              >
                <Database className="w-5 h-5 text-slate-700 shrink-0" />
                <span>Data & Backup</span>
              </button>
            )}

            {currentUser?.is_superadmin && onOpenSuperAdmin && (
              <button
                type="button"
                data-testid="mobile-menu-superadmin"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSuperAdmin();
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 border-2 border-amber-300 text-amber-900 font-extrabold text-sm flex items-center gap-3 cursor-pointer transition-colors shadow-2xs"
                aria-label="Open Super Admin Dashboard"
              >
                <ShieldAlert className="w-5 h-5 text-amber-800 shrink-0" />
                <span>Super Admin Dashboard</span>
              </button>
            )}

            <a
              href="https://github.com/prashmohan/lores"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border-2 border-slate-300 text-slate-800 font-bold text-sm flex items-center gap-3 cursor-pointer transition-colors"
              aria-label="View Open Source Repository on GitHub (opens in new tab)"
            >
              <Github className="w-5 h-5 text-slate-700 shrink-0" />
              <span>GitHub Repository</span>
            </a>

            <button
              type="button"
              data-testid="mobile-menu-contrast"
              onClick={() => {
                setMobileMenuOpen(false);
                onToggleHighContrast();
              }}
              className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl border-2 font-bold text-sm flex items-center gap-3 cursor-pointer transition-colors ${
                highContrast
                  ? 'bg-amber-500 text-slate-950 border-slate-900 shadow-sm'
                  : 'bg-slate-50 border-slate-300 text-slate-700 hover:text-slate-950'
              }`}
              aria-label="Toggle High Contrast Mode"
            >
              {highContrast ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
              <span>{highContrast ? 'High Contrast: ON' : 'High Contrast: OFF'}</span>
            </button>

            {currentUser && (
              <button
                type="button"
                data-testid="mobile-menu-logout"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border-2 border-rose-200 text-rose-700 font-bold text-sm flex items-center gap-3 cursor-pointer transition-colors"
                aria-label="Log Out"
              >
                <LogOut className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Log Out</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

