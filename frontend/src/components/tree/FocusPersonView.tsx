import React from 'react';
import { PersonCard } from './PersonCard';
import { Eye, ArrowUp, ArrowDown, Heart, Users, Sparkles, Plus } from 'lucide-react';
import type { FocusNeighborhoodResponse, PersonSummary } from '../../types/api';

export type RelativeType = 'parent' | 'partner' | 'child' | 'sibling';

interface FocusPersonViewProps {
  data?: FocusNeighborhoodResponse;
  neighborhood?: FocusNeighborhoodResponse;
  isViewer?: boolean;
  onSelectPerson: (id: string) => void;
  onAddRelative?: (type: RelativeType) => void;
  onEditPerson?: (person: PersonSummary) => void;
  onEditPhoto?: (person: PersonSummary) => void;
  workspaceId?: string;
}

export const FocusPersonView: React.FC<FocusPersonViewProps> = ({
  data: propData,
  neighborhood,
  isViewer = false,
  onSelectPerson,
  onAddRelative,
  onEditPerson,
  onEditPhoto,
}) => {
  const data = propData || neighborhood;
  if (!data) return null;

  const activeEditPerson = !isViewer ? onEditPerson : undefined;
  const activeEditPhoto = !isViewer ? onEditPhoto : undefined;

  return (
    <div className="flex flex-col items-center gap-10 py-6 max-w-5xl mx-auto px-4 select-none">
      {/* Viewer Mode Banner */}
      {isViewer && (
        <div
          role="status"
          className="px-4 py-1.5 rounded-full bg-blue-50 border-2 border-blue-200 text-blue-900 text-xs font-black flex items-center gap-1.5 shadow-2xs"
        >
          <Eye className="w-3.5 h-3.5 text-blue-700" />
          <span>Viewer Access (Read-Only)</span>
        </div>
      )}

      {/* Parents Section (Top) */}
      <section className="flex flex-col items-center gap-3.5 w-full" aria-label="Parents">
        <span className="text-xs font-black uppercase tracking-widest text-slate-700 bg-white px-3.5 py-1 rounded-full border-2 border-slate-200 shadow-2xs flex items-center gap-1.5">
          <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
          <span>Parents</span>
        </span>
        <div className="flex gap-4 flex-wrap justify-center items-center">
          {data.parents.map((parent) => (
            <PersonCard
              key={parent.id}
              person={parent}
              onClick={() => onSelectPerson(parent.id)}
              onEdit={activeEditPerson}
              onEditPhoto={activeEditPhoto}
            />
          ))}
          {!isViewer && onAddRelative && (
            <button
              type="button"
              onClick={() => onAddRelative('parent')}
              className="min-h-[56px] px-5 py-3 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl text-slate-700 hover:text-amber-950 hover:bg-amber-50/60 font-bold text-sm transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
              aria-label="+ Add Parent"
            >
              <Plus className="w-4 h-4 text-amber-700 stroke-[2.5]" />
              <span>Add Parent</span>
            </button>
          )}
        </div>
      </section>

      {/* Center Row: Siblings <---> Focus Person <---> Partners */}
      <section className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8 w-full">
        {/* Siblings (Left Column) */}
        <div className="flex flex-col items-center lg:items-end gap-3.5 flex-1" aria-label="Siblings">
          <span className="text-xs font-black uppercase tracking-widest text-slate-700 bg-white px-3.5 py-1 rounded-full border-2 border-slate-200 shadow-2xs flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-600" />
            <span>Siblings</span>
          </span>
          <div className="flex flex-col gap-3.5 items-center lg:items-end">
            {data.siblings.map((sibling) => (
              <PersonCard
                key={sibling.id}
                person={sibling}
                onClick={() => onSelectPerson(sibling.id)}
                onEdit={activeEditPerson}
                onEditPhoto={activeEditPhoto}
              />
            ))}
            {!isViewer && onAddRelative && (
              <button
                type="button"
                onClick={() => onAddRelative('sibling')}
                className="min-h-[48px] px-4 py-2 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl text-xs font-bold text-slate-700 hover:text-amber-950 hover:bg-amber-50/60 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                aria-label="+ Add Sibling"
              >
                <Plus className="w-3.5 h-3.5 text-amber-700 stroke-[2.5]" />
                <span>Add Sibling</span>
              </button>
            )}
          </div>
        </div>

        {/* Focus Person (Center) */}
        <div className="flex flex-col items-center justify-center my-auto px-2" aria-label="Focus Person">
          <span className="text-xs font-black uppercase tracking-widest text-amber-900 bg-amber-100 px-3.5 py-1 rounded-full border-2 border-amber-300 mb-3 shadow-2xs flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>Focus Person</span>
          </span>
          <PersonCard
            person={data.focus_person}
            isFocus={true}
            onEdit={activeEditPerson}
            onEditPhoto={activeEditPhoto}
          />
        </div>

        {/* Spouse / Partner (Right Column) */}
        <div className="flex flex-col items-center lg:items-start gap-3.5 flex-1" aria-label="Spouse and Partners">
          <span className="text-xs font-black uppercase tracking-widest text-slate-700 bg-white px-3.5 py-1 rounded-full border-2 border-slate-200 shadow-2xs flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-100" />
            <span>Spouse / Partner</span>
          </span>
          <div className="flex flex-col gap-3.5 items-center lg:items-start">
            {data.partners.map((partner) => (
              <PersonCard
                key={partner.id}
                person={partner}
                onClick={() => onSelectPerson(partner.id)}
                onEdit={activeEditPerson}
                onEditPhoto={activeEditPhoto}
              />
            ))}
            {!isViewer && onAddRelative && (
              <button
                type="button"
                onClick={() => onAddRelative('partner')}
                className="min-h-[48px] px-4 py-2 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl text-xs font-bold text-slate-700 hover:text-amber-950 hover:bg-amber-50/60 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                aria-label="+ Add Partner"
              >
                <Plus className="w-3.5 h-3.5 text-amber-700 stroke-[2.5]" />
                <span>Add Partner</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Children Section (Bottom) */}
      <section className="flex flex-col items-center gap-3.5 w-full" aria-label="Children">
        <span className="text-xs font-black uppercase tracking-widest text-slate-700 bg-white px-3.5 py-1 rounded-full border-2 border-slate-200 shadow-2xs flex items-center gap-1.5">
          <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
          <span>Children</span>
        </span>
        <div className="flex gap-4 flex-wrap justify-center items-center">
          {data.children.map((child) => (
            <PersonCard
              key={child.id}
              person={child}
              onClick={() => onSelectPerson(child.id)}
              onEdit={activeEditPerson}
              onEditPhoto={activeEditPhoto}
            />
          ))}
          {!isViewer && onAddRelative && (
            <button
              type="button"
              onClick={() => onAddRelative('child')}
              className="min-h-[56px] px-5 py-3 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl text-slate-700 hover:text-amber-950 hover:bg-amber-50/60 font-bold text-sm transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
              aria-label="+ Add Child"
            >
              <Plus className="w-4 h-4 text-amber-700 stroke-[2.5]" />
              <span>Add Child</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
