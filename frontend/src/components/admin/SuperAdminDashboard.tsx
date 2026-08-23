import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ShieldAlert, Users, TreePine, BookOpen, Layers, RefreshCw, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { AdminSystemStats, AdminWorkspaceItem } from '../../types/api';

interface SuperAdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  isOpen,
  onClose,
  onSelectWorkspace,
}) => {
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceItem[]>([]);
  const [stats, setStats] = useState<AdminSystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wsList, systemStats] = await Promise.all([
        api.admin.getWorkspaces(),
        api.admin.getStats(),
      ]);
      setWorkspaces(wsList);
      setStats(systemStats);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load super admin data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl z-50 max-h-[90vh] flex flex-col border-2 border-slate-200 focus:outline-none"
          aria-describedby="super-admin-description"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-sm">
                <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <Dialog.Title className="text-2xl font-extrabold text-slate-900 leading-tight">
                  Super Administrator Dashboard
                </Dialog.Title>
                <p id="super-admin-description" className="text-sm text-slate-600 font-medium">
                  System-wide registry of all family tree workspaces and workspace administrators.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                aria-label="Refresh admin data"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close super admin dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-900">{stats.total_workspaces}</div>
                  <div className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Workspaces</div>
                </div>
              </div>

              <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-900">{stats.total_users}</div>
                  <div className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Total Users</div>
                </div>
              </div>

              <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <TreePine className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-900">{stats.total_people}</div>
                  <div className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Family Members</div>
                </div>
              </div>

              <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-900">{stats.total_lore_notes}</div>
                  <div className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Lore Stories</div>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-sm font-semibold mb-4"
            >
              {error}
            </div>
          )}

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto border-2 border-slate-200 rounded-2xl">
            {loading && workspaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                <p className="text-sm font-bold text-slate-600">Loading system workspaces...</p>
              </div>
            ) : workspaces.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Layers className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p className="text-base font-bold">No workspaces found.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-200 text-2xs uppercase tracking-wider font-extrabold text-slate-600">
                    <th className="py-3 px-4">Workspace / Family Tree</th>
                    <th className="py-3 px-4">Administrators</th>
                    <th className="py-3 px-4 text-center">Members</th>
                    <th className="py-3 px-4 text-center">People</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm font-medium text-slate-800">
                  {workspaces.map((ws) => (
                    <tr key={ws.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900">{ws.name}</div>
                        <div className="text-xs font-mono text-slate-400">/{ws.slug}</div>
                        {ws.description && (
                          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">{ws.description}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {ws.admins.map((admin) => (
                            <div key={admin.id} className="text-xs">
                              <span className="font-bold text-slate-900">{admin.display_name}</span>
                              <span className="text-slate-500 ml-1">({admin.email})</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          {ws.member_count}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {ws.people_count}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {formatDate(ws.created_at)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectWorkspace(ws.id);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-500 hover:text-slate-950 font-bold text-xs text-slate-700 transition-colors cursor-pointer"
                        >
                          <span>Open Tree</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
