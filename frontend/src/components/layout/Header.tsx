import React from 'react';
import { TreePine, Sun, Moon, LogOut, ChevronDown, User as UserIcon } from 'lucide-react';
import type { UserRead, UserWorkspaceMembership, WorkspaceRead } from '../../types/api';

interface HeaderProps {
  currentUser: UserRead | null;
  workspaces: UserWorkspaceMembership[];
  currentWorkspace: WorkspaceRead | null;
  onSelectWorkspace: (workspace: WorkspaceRead) => void;
  onLogout: () => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  onLogout,
  highContrast,
  onToggleHighContrast,
}) => {
  return (
    <header className="bg-white border-b-2 border-slate-200 px-4 sm:px-8 py-3 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-sm">
              <TreePine className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900 leading-none block">
                Lores
              </span>
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block">
                Family Tree
              </span>
            </div>
          </div>

          {/* Workspace Switcher */}
          {workspaces.length > 0 && currentWorkspace && (
            <div className="relative inline-flex items-center">
              <label htmlFor="workspace-select" className="sr-only">
                Select Workspace
              </label>
              <select
                id="workspace-select"
                value={currentWorkspace.id}
                onChange={(e) => {
                  const selected = workspaces.find((w) => w.workspace.id === e.target.value);
                  if (selected) {
                    onSelectWorkspace(selected.workspace);
                  }
                }}
                className="appearance-none bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 text-slate-900 font-bold text-sm rounded-lg pl-3 pr-8 py-2 cursor-pointer focus:border-amber-500 transition-colors"
              >
                {workspaces.map((item) => (
                  <option key={item.workspace.id} value={item.workspace.id}>
                    {item.workspace.name} ({item.role})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-600 absolute right-2.5 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Controls: High Contrast + User Profile */}
        <div className="flex items-center gap-3">
          {/* High Contrast Toggle */}
          <button
            type="button"
            onClick={onToggleHighContrast}
            className="p-2.5 rounded-lg border-2 border-slate-300 hover:border-slate-400 bg-slate-50 text-slate-700 hover:text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors"
            title="Toggle High Contrast Mode"
            aria-label="Toggle High Contrast Mode"
          >
            {highContrast ? <Sun className="w-4 h-4 text-amber-600" /> : <Moon className="w-4 h-4" />}
            <span className="hidden md:inline">{highContrast ? 'Standard Contrast' : 'High Contrast'}</span>
          </button>

          {/* User Info & Logout */}
          {currentUser && (
            <div className="flex items-center gap-3 pl-3 border-l-2 border-slate-200">
              <div className="flex items-center gap-2 text-left">
                <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-sm">
                  {currentUser.display_name ? currentUser.display_name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 leading-tight">
                    {currentUser.display_name || currentUser.email}
                  </p>
                  <p className="text-2xs text-slate-500 truncate max-w-[140px]">
                    {currentUser.email}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="p-2 rounded-lg text-slate-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                title="Log Out"
                aria-label="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
