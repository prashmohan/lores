import React, { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Sparkles, UserCheck, UserPlus } from 'lucide-react';
import type { PersonCreate, PersonRead, PersonSummary } from '../../types/api';
import type { RelativeType } from './FocusPersonView';
import { extractKnownPlaces, generateYearSuggestions } from '../../lib/autocomplete';

interface AddRelativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  relativeType: RelativeType | null;
  focusPerson: PersonSummary | null;
  partners?: PersonSummary[];
  existingParents?: PersonSummary[];
  allPeople?: PersonRead[];
  onSubmit: (
    relativeType: RelativeType,
    data?: PersonCreate,
    existingPersonId?: string,
    otherParentId?: string
  ) => Promise<void>;
}

export const AddRelativeModal: React.FC<AddRelativeModalProps> = ({
  isOpen,
  onClose,
  relativeType,
  focusPerson,
  partners = [],
  existingParents = [],
  allPeople = [],
  onSubmit,
}) => {
  // Mode: 'new' or 'link_existing'
  const [mode, setMode] = useState<'new' | 'link_existing'>('new');
  const [selectedExistingId, setSelectedExistingId] = useState<string>('');
  const [selectedOtherParentId, setSelectedOtherParentId] = useState<string>('');

  // New person fields
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

  const knownPlaces = useMemo(() => extractKnownPlaces(allPeople), [allPeople]);
  const yearSuggestions = useMemo(() => generateYearSuggestions(), []);

  // Available existing people (excluding focusPerson)
  const availableExistingPeople = allPeople.filter(
    (p) => !focusPerson || p.id !== focusPerson.id
  );

  // Reset form when modal opens or relativeType / focusPerson changes
  useEffect(() => {
    if (isOpen && focusPerson) {
      setMode('new');
      setSelectedExistingId('');
      
      // Default other parent if adding a child and focus person has partners
      if (relativeType === 'child' && partners.length > 0) {
        setSelectedOtherParentId(partners[0].id);
      } else {
        setSelectedOtherParentId('');
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, relativeType, focusPerson?.id]);

  if (!isOpen || !relativeType || !focusPerson) {
    return null;
  }

  const typeLabels: Record<RelativeType, string> = {
    parent: 'Parent',
    partner: 'Spouse / Partner',
    child: 'Child',
    sibling: 'Sibling',
  };

  const titleText = `Add ${typeLabels[relativeType]} for ${[focusPerson.first_name, focusPerson.last_name].filter(Boolean).join(' ')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'link_existing') {
      if (!selectedExistingId) {
        setError('Please select a person to link.');
        return;
      }
      setError(null);
      setLoading(true);
      try {
        await onSubmit(
          relativeType,
          undefined,
          selectedExistingId,
          relativeType === 'child' ? selectedOtherParentId || undefined : undefined
        );
        onClose();
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to link family relationship.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const payload: PersonCreate = {
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        maiden_name: maidenName.trim() || undefined,
        gender,
        is_living: isLiving,
        birth_date: birthDate.trim() || undefined,
        birth_place: birthPlace.trim() || undefined,
        death_date: !isLiving && deathDate.trim() ? deathDate.trim() : undefined,
        death_place: !isLiving && deathPlace.trim() ? deathPlace.trim() : undefined,
      };

      await onSubmit(
        relativeType,
        payload,
        undefined,
        relativeType === 'child' && selectedOtherParentId ? selectedOtherParentId : undefined
      );
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
          className="fixed left-1/2 bottom-0 -translate-x-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl z-50 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto border-2 border-slate-200"
          aria-describedby="add-relative-description"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <Dialog.Title className="text-xl font-extrabold text-slate-900 leading-snug">
              {titleText}
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

          {/* Mode Switcher: Create New vs Link Existing */}
          {availableExistingPeople.length > 0 && (
            <div className="flex items-center gap-2 mt-4 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setMode('new');
                  setError(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'new'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create New Person</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('link_existing');
                  setError(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'link_existing'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Link Existing Person</span>
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Child Specific: Select Other Parent (Dual Parents) */}
            {relativeType === 'child' && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <label htmlFor="other_parent_select" className="block text-sm font-bold text-amber-950">
                  Who is the other parent of this child?
                </label>
                <select
                  id="other_parent_select"
                  value={selectedOtherParentId}
                  onChange={(e) => setSelectedOtherParentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border-2 border-amber-300 focus:border-amber-500 text-base text-slate-900 bg-white font-medium cursor-pointer"
                >
                  <option value="">No other parent / Unknown</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({focusPerson.first_name}&apos;s Partner)
                    </option>
                  ))}
                  {availableExistingPeople
                    .filter((p) => !partners.some((part) => part.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name} (Other person in tree)
                      </option>
                    ))}
                </select>
                <p className="text-xs text-amber-800 font-medium">
                  Selecting both parents automatically connects the child to their joint family union.
                </p>
              </div>
            )}

            {/* Parent Specific: Recommended existing parent's partners */}
            {relativeType === 'parent' && existingParents.length > 0 && mode === 'link_existing' && (
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                <div className="flex items-center gap-1.5 text-blue-950 font-bold text-sm">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Existing Parents in Tree:</span>
                </div>
                <p className="text-xs text-blue-800">
                  {focusPerson.first_name} is already linked to{' '}
                  {existingParents.map((p) => `${p.first_name} ${p.last_name}`).join(', ')}. Select another parent below to link them together:
                </p>
              </div>
            )}

            {/* MODE: LINK EXISTING PERSON */}
            {mode === 'link_existing' ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor="existing_person_select" className="block text-sm font-bold text-slate-800 mb-1">
                    Select Person from Family Tree <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="existing_person_select"
                    value={selectedExistingId}
                    onChange={(e) => setSelectedExistingId(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 bg-white font-medium cursor-pointer"
                  >
                    <option value="">-- Choose an existing relative --</option>
                    {availableExistingPeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name} {p.birth_date ? `(b. ${p.birth_date})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              /* MODE: CREATE NEW PERSON */
              <>
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
                      Last Name <span className="text-xs font-normal text-slate-500">(Optional)</span>
                    </label>
                    <input
                      id="last_name"
                      type="text"
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
                      list="add-relative-years-list"
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
                      list="add-relative-places-list"
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
                        list="add-relative-years-list"
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
                        list="add-relative-places-list"
                        value={deathPlace}
                        onChange={(e) => setDeathPlace(e.target.value)}
                        placeholder="e.g. Boston, MA"
                        className="w-full px-3.5 py-2.5 rounded-lg border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
                      />
                    </div>
                  </div>
                )}

                {/* Autocomplete Datalists */}
                <datalist id="add-relative-years-list">
                  {yearSuggestions.map((yr) => (
                    <option key={yr} value={yr} />
                  ))}
                </datalist>

                <datalist id="add-relative-places-list">
                  {knownPlaces.map((pl) => (
                    <option key={pl} value={pl} />
                  ))}
                </datalist>
              </>
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
                {loading
                  ? 'Saving...'
                  : mode === 'link_existing'
                  ? `Link as ${typeLabels[relativeType]}`
                  : `Add ${typeLabels[relativeType]}`}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
