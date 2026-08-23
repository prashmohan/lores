import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, TreePine, Loader2 } from 'lucide-react';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => Promise<void>;
}

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Family tree name is required.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onSubmit(name.trim(), description.trim() || undefined);
      setName('');
      setDescription('');
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create new family tree.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl z-50 max-h-[90vh] overflow-y-auto border-2 border-slate-200 focus:outline-none"
          aria-describedby="create-workspace-description"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                <TreePine className="w-5 h-5 stroke-[2.5]" />
              </div>
              <Dialog.Title className="text-xl font-extrabold text-slate-900 leading-tight">
                Create New Family Tree
              </Dialog.Title>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close create family dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <p id="create-workspace-description" className="text-sm text-slate-600 font-medium mt-3">
            Start a new dedicated workspace for a family branch, in-laws, or separate lineage.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 p-3.5 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-sm font-semibold"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="ws_name" className="block text-sm font-bold text-slate-800 mb-1">
                Family Tree Name <span className="text-red-600">*</span>
              </label>
              <input
                id="ws_name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Miller & Higgins Lineage"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
              />
            </div>

            <div>
              <label htmlFor="ws_description" className="block text-sm font-bold text-slate-800 mb-1">
                Description / Notes <span className="text-xs font-normal text-slate-500">(Optional)</span>
              </label>
              <textarea
                id="ws_description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ancestral history spanning New England and Virginia branches..."
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl border-2 border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loading ? 'Creating...' : 'Create Family Tree'}</span>
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
