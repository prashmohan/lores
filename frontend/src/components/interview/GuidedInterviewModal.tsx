import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Sparkles, User, Heart, Baby, Users, ArrowRight } from 'lucide-react';

export interface GuidedInterviewData {
  relative_type: string;
  first_name: string;
  last_name: string;
  maiden_name?: string;
  birth_date?: string;
  birth_place?: string;
  is_living?: boolean;
  death_date?: string;
  death_place?: string;
  notes?: string;
}

interface GuidedInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (relativeData: GuidedInterviewData) => Promise<void> | void;
  basePersonName: string;
}

export const GuidedInterviewModal: React.FC<GuidedInterviewModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  basePersonName,
}) => {
  const [step, setStep] = useState(1);
  const [relationType, setRelationType] = useState('parent');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [maidenName, setMaidenName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [isLiving, setIsLiving] = useState(true);
  const [deathYear, setDeathYear] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setRelationType('parent');
      setFirstName('');
      setLastName('');
      setMaidenName('');
      setBirthYear('');
      setBirthPlace('');
      setIsLiving(true);
      setDeathYear('');
      setNotes('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFinish = async () => {
    if (!firstName.trim()) {
      setError('Please provide a first name to continue.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        relative_type: relationType,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        maiden_name: maidenName.trim() || undefined,
        birth_date: birthYear.trim() || undefined,
        birth_place: birthPlace.trim() || undefined,
        is_living: isLiving,
        death_date: !isLiving && deathYear.trim() ? deathYear.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save relative. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const relationOptions = [
    {
      id: 'parent',
      label: 'parent',
      displayLabel: 'Parent',
      subtitle: 'Mother or Father',
      icon: <User className="w-6 h-6 text-amber-700" />,
    },
    {
      id: 'partner',
      label: 'partner',
      displayLabel: 'Partner',
      subtitle: 'Spouse or Partner',
      icon: <Heart className="w-6 h-6 text-rose-600" />,
    },
    {
      id: 'child',
      label: 'child',
      displayLabel: 'Child',
      subtitle: 'Son or Daughter',
      icon: <Baby className="w-6 h-6 text-emerald-600" />,
    },
    {
      id: 'sibling',
      label: 'sibling',
      displayLabel: 'Sibling',
      subtitle: 'Brother or Sister',
      icon: <Users className="w-6 h-6 text-sky-600" />,
    },
  ];

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl z-50 max-h-[90vh] overflow-y-auto border-2 border-slate-200 focus:outline-none space-y-4"
          aria-describedby="guided-interview-description"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                <Sparkles className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <Dialog.Title className="text-2xl font-bold text-slate-900 leading-tight">
                  Family Lore Assistant
                </Dialog.Title>
                <p id="guided-interview-description" className="text-base text-slate-600">
                  Let's add a relative to <strong>{basePersonName}</strong>.
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close interview assistant"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-2 py-2">
            <div
              className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                step >= 1 ? 'bg-amber-500' : 'bg-slate-200'
              }`}
            />
            <div
              className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                step >= 2 ? 'bg-amber-500' : 'bg-slate-200'
              }`}
            />
            <span className="text-xs font-bold text-slate-500 pl-2">Step {step} of 2</span>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border-2 border-red-200 rounded-xl text-red-800 text-sm font-semibold"
            >
              {error}
            </div>
          )}

          {/* Step 1: Choose Relationship */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-800">
                  Who would you like to add?
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {relationOptions.map((opt) => {
                  const isSelected = relationType === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setRelationType(opt.id);
                        setStep(2);
                      }}
                      className={`p-3 border-2 rounded-xl font-bold capitalize transition-all duration-150 flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-center">
                        <div className="font-bold capitalize">{opt.label}</div>
                        <div className="text-xs text-slate-500 font-normal">{opt.subtitle}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="interview_first_name" className="block text-sm font-bold text-slate-700">
                  What is their first name?
                </label>
                <input
                  id="interview_first_name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Margaret"
                  className="w-full text-lg p-3 border-2 border-slate-300 rounded-xl mt-1 focus:border-amber-500 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="interview_last_name" className="block text-sm font-bold text-slate-700">
                  What is their last name / family name?
                </label>
                <input
                  id="interview_last_name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Vance"
                  className="w-full text-lg p-3 border-2 border-slate-300 rounded-xl mt-1 focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label htmlFor="interview_birth_year" className="block text-sm font-bold text-slate-700">
                  What year were they born? (Approximate is fine)
                </label>
                <input
                  id="interview_birth_year"
                  type="text"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="e.g. 1942 or circa 1940"
                  className="w-full text-lg p-3 border-2 border-slate-300 rounded-xl mt-1 focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-3 py-1">
                <input
                  id="interview_is_living"
                  type="checkbox"
                  checked={isLiving}
                  onChange={(e) => setIsLiving(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="interview_is_living" className="text-sm font-bold text-slate-700 cursor-pointer">
                  This relative is currently living
                </label>
              </div>

              {!isLiving && (
                <div>
                  <label htmlFor="interview_death_year" className="block text-sm font-bold text-slate-700">
                    What year did they pass away? (Optional)
                  </label>
                  <input
                    id="interview_death_year"
                    type="text"
                    value={deathYear}
                    onChange={(e) => setDeathYear(e.target.value)}
                    placeholder="e.g. 2015"
                    className="w-full text-lg p-3 border-2 border-slate-300 rounded-xl mt-1 focus:border-amber-500 outline-none"
                  />
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-slate-600 font-semibold hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={!firstName.trim() || loading}
                  className="px-6 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors shadow cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Save Relative'}
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
