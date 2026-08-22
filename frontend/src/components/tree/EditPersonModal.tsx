import React, { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import type { PersonRead, PersonSummary, PersonUpdate } from '../../types/api';
import { extractKnownPlaces, generateYearSuggestions } from '../../lib/autocomplete';

interface EditPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  person: PersonSummary | null;
  allPeople?: PersonRead[];
  onSave: (personId: string, updates: PersonUpdate) => Promise<void>;
  onDelete: (personId: string) => Promise<void>;
}

export const EditPersonModal: React.FC<EditPersonModalProps> = ({
  isOpen,
  onClose,
  person,
  allPeople = [],
  onSave,
  onDelete,
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
  const [biography, setBiography] = useState('');

  const knownPlaces = useMemo(() => extractKnownPlaces(allPeople), [allPeople]);
  const yearSuggestions = useMemo(() => generateYearSuggestions(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (isOpen && person) {
      setFirstName(person.first_name || '');
      setLastName(person.last_name || '');
      setMaidenName(person.maiden_name || '');
      setGender(person.gender || 'unknown');
      setIsLiving(person.is_living);
      setBirthDate(person.birth_date || '');
      setBirthPlace(person.birth_place || '');
      setDeathDate(person.death_date || '');
      setDeathPlace(person.death_place || '');
      setBiography('');
      setError(null);
      setLoading(false);
      setIsConfirmingDelete(false);
    }
  }, [isOpen, person]);

  if (!isOpen || !person) return null;

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
      const updates: PersonUpdate = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        maiden_name: maidenName.trim() || null,
        gender,
        is_living: isLiving,
        birth_date: birthDate.trim() || null,
        birth_place: birthPlace.trim() || null,
        death_date: !isLiving && deathDate.trim() ? deathDate.trim() : null,
        death_place: !isLiving && deathPlace.trim() ? deathPlace.trim() : null,
        biography: biography.trim() || null,
      };

      await onSave(person.id, updates);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update person details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      await onDelete(person.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to delete person.');
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
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white rounded-2xl p-6 shadow-2xl z-50 max-h-[90vh] overflow-y-auto border-2 border-slate-200"
          aria-describedby="edit-person-description"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <Dialog.Title className="text-xl font-extrabold text-slate-900 leading-snug">
              Edit Details for {person.first_name} {person.last_name}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <p id="edit-person-description" className="text-sm text-slate-600 mt-2">
            Update personal records, vital events, and oral biography below.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium"
            >
              {error}
            </div>
          )}

          {isConfirmingDelete ? (
            <div className="mt-6 p-4 rounded-xl border-2 border-rose-200 bg-rose-50 space-y-3">
              <div className="flex items-center gap-2 text-rose-900 font-bold">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Move this person to Family Trash?</span>
              </div>
              <p className="text-xs text-rose-700">
                {person.first_name} and their direct relationship links will be moved to the 30-day Family Trash recovery bin. You can restore them anytime within 30 days.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white font-bold text-sm hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{loading ? 'Deleting...' : 'Confirm Move to Trash'}</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit_first_name" className="block text-sm font-bold text-slate-800 mb-1">
                    First Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="edit_first_name"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Margaret"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label htmlFor="edit_last_name" className="block text-sm font-bold text-slate-800 mb-1">
                    Last Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="edit_last_name"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Miller"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit_maiden_name" className="block text-sm font-bold text-slate-800 mb-1">
                    Maiden Name <span className="text-xs font-normal text-slate-500">(Optional)</span>
                  </label>
                  <input
                    id="edit_maiden_name"
                    type="text"
                    value={maidenName}
                    onChange={(e) => setMaidenName(e.target.value)}
                    placeholder="e.g. Higgins"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label htmlFor="edit_gender" className="block text-sm font-bold text-slate-800 mb-1">
                    Gender
                  </label>
                  <select
                    id="edit_gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 bg-white font-medium cursor-pointer"
                  >
                    <option value="unknown">Unknown</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 py-1">
                <input
                  id="edit_is_living"
                  type="checkbox"
                  checked={isLiving}
                  onChange={(e) => setIsLiving(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="edit_is_living" className="text-sm font-bold text-slate-800 cursor-pointer">
                  This person is living
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit_birth_date" className="block text-sm font-bold text-slate-800 mb-1">
                    Birth Date / Year
                  </label>
                  <input
                    id="edit_birth_date"
                    type="text"
                    list="edit-person-years-list"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    placeholder="e.g. 1942 or 12 Apr 1942"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label htmlFor="edit_birth_place" className="block text-sm font-bold text-slate-800 mb-1">
                    Birth Place
                  </label>
                  <input
                    id="edit_birth_place"
                    type="text"
                    list="edit-person-places-list"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder="e.g. Boston, MA"
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                  />
                </div>
              </div>

              {!isLiving && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label htmlFor="edit_death_date" className="block text-sm font-bold text-slate-800 mb-1">
                      Death Date / Year
                    </label>
                    <input
                      id="edit_death_date"
                      type="text"
                      list="edit-person-years-list"
                      value={deathDate}
                      onChange={(e) => setDeathDate(e.target.value)}
                      placeholder="e.g. 2018"
                      className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit_death_place" className="block text-sm font-bold text-slate-800 mb-1">
                      Death Place
                    </label>
                    <input
                      id="edit_death_place"
                      type="text"
                      list="edit-person-places-list"
                      value={deathPlace}
                      onChange={(e) => setDeathPlace(e.target.value)}
                      placeholder="e.g. Seattle, WA"
                      className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                    />
                  </div>
                </div>
              )}

              {/* Autocomplete Datalists */}
              <datalist id="edit-person-years-list">
                {yearSuggestions.map((yr) => (
                  <option key={yr} value={yr} />
                ))}
              </datalist>

              <datalist id="edit-person-places-list">
                {knownPlaces.map((pl) => (
                  <option key={pl} value={pl} />
                ))}
              </datalist>

              <div>
                <label htmlFor="edit_biography" className="block text-sm font-bold text-slate-800 mb-1">
                  Biography / Notes <span className="text-xs font-normal text-slate-500">(Optional)</span>
                </label>
                <textarea
                  id="edit_biography"
                  rows={3}
                  value={biography}
                  onChange={(e) => setBiography(e.target.value)}
                  placeholder="Key life stories, accomplishments, nicknames..."
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 font-medium"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-lg text-rose-700 hover:bg-rose-50 font-bold text-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Person</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-5 py-2.5 rounded-lg border-2 border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
