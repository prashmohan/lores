import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { PersonCreate, PersonSummary } from '../../types/api';
import type { RelativeType } from './FocusPersonView';

interface AddRelativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  relativeType: RelativeType | null;
  focusPerson: PersonSummary | null;
  onSubmit: (relativeType: RelativeType, data: PersonCreate) => Promise<void>;
}

export const AddRelativeModal: React.FC<AddRelativeModalProps> = ({
  isOpen,
  onClose,
  relativeType,
  focusPerson,
  onSubmit,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [maidenName, setMaidenName] = useState('');
  const [gender, setGender] = useState('unknown');
  const [isLiving, setIsLiving] = useState(true);
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [deathPlace, setDeathPlace] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens or relativeType changes
  useEffect(() => {
    if (isOpen && focusPerson) {
      setFirstName('');
      // Default last name based on relationship type
      if (relativeType === 'child' || relativeType === 'sibling') {
        setLastName(focusPerson.last_name || '');
      } else {
        setLastName('');
      }
      setMaidenName('');
      setGender('unknown');
      setIsLiving(true);
      setBirthDate('');
      setBirthPlace('');
      setDeathDate('');
      setDeathPlace('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen, relativeType, focusPerson]);

  if (!isOpen || !relativeType || !focusPerson) {
    return null;
  }

  const typeLabels: Record<RelativeType, string> = {
    parent: 'Parent',
    partner: 'Spouse / Partner',
    child: 'Child',
    sibling: 'Sibling',
  };

  const titleText = `Add ${typeLabels[relativeType]} for ${focusPerson.first_name} ${focusPerson.last_name}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (!lastName.trim()) {
      setError('Last name is required.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const payload: PersonCreate = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        maiden_name: maidenName.trim() || undefined,
        gender,
        is_living: isLiving,
        birth_date: birthDate.trim() || undefined,
        birth_place: birthPlace.trim() || undefined,
        death_date: !isLiving && deathDate.trim() ? deathDate.trim() : undefined,
        death_place: !isLiving && deathPlace.trim() ? deathPlace.trim() : undefined,
      };

      await onSubmit(relativeType, payload);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to add relative. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-40 transition-opacity" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl z-50 max-h-[90vh] overflow-y-auto border-2 border-slate-200"
          aria-describedby="add-relative-description"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <Dialog.Title className="text-xl font-bold text-slate-900 leading-snug">
              {titleText}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <p id="add-relative-description" className="text-sm text-slate-600 mt-2">
            Enter the details of the new relative below.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-bold text-slate-800 mb-1">
                  First Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="first_name"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Margaret"
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
                />
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-bold text-slate-800 mb-1">
                  Last Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="last_name"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Miller"
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="maiden_name" className="block text-sm font-bold text-slate-800 mb-1">
                  Maiden Name <span className="text-xs font-normal text-slate-500">(Optional)</span>
                </label>
                <input
                  id="maiden_name"
                  type="text"
                  value={maidenName}
                  onChange={(e) => setMaidenName(e.target.value)}
                  placeholder="e.g. Higgins"
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
                />
              </div>

              <div>
                <label htmlFor="gender" className="block text-sm font-bold text-slate-800 mb-1">
                  Gender
                </label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 bg-white font-medium"
                >
                  <option value="unknown">Unknown</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 py-2">
              <input
                id="is_living"
                type="checkbox"
                checked={isLiving}
                onChange={(e) => setIsLiving(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="is_living" className="text-sm font-bold text-slate-800 cursor-pointer">
                This person is living
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="birth_date" className="block text-sm font-bold text-slate-800 mb-1">
                  Birth Date / Year
                </label>
                <input
                  id="birth_date"
                  type="text"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  placeholder="e.g. 1942 or 12 Apr 1942"
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
                />
              </div>

              <div>
                <label htmlFor="birth_place" className="block text-sm font-bold text-slate-800 mb-1">
                  Birth Place
                </label>
                <input
                  id="birth_place"
                  type="text"
                  value={birthPlace}
                  onChange={(e) => setBirthPlace(e.target.value)}
                  placeholder="e.g. New York, NY"
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
                />
              </div>
            </div>

            {!isLiving && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label htmlFor="death_date" className="block text-sm font-bold text-slate-800 mb-1">
                    Death Date / Year
                  </label>
                  <input
                    id="death_date"
                    type="text"
                    value={deathDate}
                    onChange={(e) => setDeathDate(e.target.value)}
                    placeholder="e.g. 2008"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
                  />
                </div>

                <div>
                  <label htmlFor="death_place" className="block text-sm font-bold text-slate-800 mb-1">
                    Death Place
                  </label>
                  <input
                    id="death_place"
                    type="text"
                    value={deathPlace}
                    onChange={(e) => setDeathPlace(e.target.value)}
                    placeholder="e.g. Boston, MA"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 rounded-lg border-2 border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow transition-colors disabled:opacity-50 cursor-pointer min-h-[44px] flex items-center gap-2"
              >
                {loading ? 'Adding...' : `Add ${typeLabels[relativeType]}`}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
