import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Trash2, Loader2, RefreshCw, RotateCcw, AlertTriangle, User, BookOpen, CheckCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { TrashItemRead } from '../../types/api';

interface TrashCanModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onRestored?: (item: TrashItemRead) => void;
}

export const TrashCanModal: React.FC<TrashCanModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  onRestored,
}) => {
  const [items, setItems] = useState<TrashItemRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.trash.list(workspaceId, 30);
      setItems(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load trash items.');
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      fetchTrash();
    }
  }, [isOpen, fetchTrash]);

  if (!isOpen) return null;

  const handleRestore = async (item: TrashItemRead) => {
    setRestoringId(item.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.trash.restore(workspaceId, item.entity_type, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSuccessMessage(`Successfully restored "${item.name}".`);
      onRestored?.(item);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(`Failed to restore ${item.name}.`);
      }
    } finally {
      setRestoringId(null);
    }
  };

  const handlePurge = async () => {
    if (!window.confirm('Are you sure you want to permanently delete all items in trash? This cannot be undone.')) {
      return;
    }
    setPurging(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.trash.purge(workspaceId);
      setItems([]);
      setSuccessMessage(`Emptied trash (${res.purged_count} items permanently deleted).`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to empty trash.');
      }
    } finally {
      setPurging(false);
    }
  };

  const getItemIcon = (type: string) => {
    if (type === 'person') {
      return <User className="w-5 h-5 text-amber-700" />;
    }
    return <BookOpen className="w-5 h-5 text-sky-700" />;
  };

  const formatEntityType = (type: string) => {
    if (type === 'person') return 'Person';
    if (type === 'lore_note' || type === 'lore') return 'Lore Note';
    return type;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" />
        <Dialog.Content
          className="fixed bottom-0 sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl z-50 max-h-[85vh] flex flex-col border-2 border-slate-200 focus:outline-none"
          aria-describedby="trash-can-description"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                <Trash2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <Dialog.Title className="text-2xl font-extrabold text-slate-900 leading-tight">
                  Family Trash
                </Dialog.Title>
                <p id="trash-can-description" className="text-sm text-slate-600 font-medium">
                  30-Day Recovery Bin. 1-click restore for deleted relatives and stories.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchTrash}
                disabled={loading}
                aria-label="Refresh trash"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close trash modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Messages */}
          <div className="pt-3 space-y-2">
            {successMessage && (
              <div
                role="status"
                className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-bold flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-semibold flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {loading && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                <p className="text-sm font-bold text-slate-600">Loading trash bin...</p>
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="text-center py-12">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Trash2 className="w-7 h-7" />
                </div>
                <h4 className="text-lg font-bold text-slate-800">Trash is Empty</h4>
                <p className="text-sm text-slate-500 max-w-xs mx-auto mt-1">
                  Deleted relatives or lore notes will stay here for 30 days before being permanently removed.
                </p>
              </div>
            )}

            {items.map((item) => {
              const isRestoring = restoringId === item.id;

              return (
                <div
                  key={`${item.entity_type}-${item.id}`}
                  className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl flex items-center justify-between gap-3 hover:bg-slate-100/80 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                      {getItemIcon(item.entity_type)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-base truncate">
                          {item.name}
                        </span>
                        <span className="text-2xs font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 shrink-0">
                          {formatEntityType(item.entity_type)}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-amber-700 mt-0.5">
                        {item.days_remaining} {item.days_remaining === 1 ? 'day' : 'days'} left before permanent deletion
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRestore(item)}
                    disabled={isRestoring || purging}
                    className="min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Restore ${item.name}`}
                  >
                    {isRestoring ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                    )}
                    <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            {items.length > 0 ? (
              <button
                type="button"
                onClick={handlePurge}
                disabled={purging || loading}
                className="min-h-[44px] px-4 py-2 text-rose-700 hover:text-rose-800 hover:bg-rose-50 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{purging ? 'Emptying...' : 'Empty Trash'}</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition-colors cursor-pointer flex items-center justify-center text-sm"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
