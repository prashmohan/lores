import React from 'react';
import { PersonCard } from './PersonCard';
import type { FocusNeighborhoodResponse, PersonSummary } from '../../types/api';

export type RelativeType = 'parent' | 'partner' | 'child' | 'sibling';

interface FocusPersonViewProps {
  data: FocusNeighborhoodResponse;
  onSelectPerson: (id: string) => void;
  onAddRelative: (type: RelativeType) => void;
  onEditPerson?: (person: PersonSummary) => void;
}

export const FocusPersonView: React.FC<FocusPersonViewProps> = ({
  data,
  onSelectPerson,
  onAddRelative,
  onEditPerson,
}) => {
  return (
    <div className="flex flex-col items-center gap-8 py-8 max-w-5xl mx-auto px-4 select-none">
      {/* Parents Section (Top) */}
      <section className="flex flex-col items-center gap-3 w-full" aria-label="Parents">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
          Parents
        </span>
        <div className="flex gap-4 flex-wrap justify-center items-center">
          {data.parents.map((parent) => (
            <PersonCard
              key={parent.id}
              person={parent}
              onClick={() => onSelectPerson(parent.id)}
              onEdit={onEditPerson}
            />
          ))}
          <button
            type="button"
            onClick={() => onAddRelative('parent')}
            className="min-h-[52px] px-5 py-3 border-2 border-dashed border-slate-300 hover:border-slate-500 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 font-semibold text-sm transition-colors flex items-center gap-2 cursor-pointer"
            aria-label="+ Add Parent"
          >
            <span className="text-lg font-bold" aria-hidden="true">+</span>
            <span>Add Parent</span>
          </button>
        </div>
      </section>

      {/* Center Row: Siblings <---> Focus Person <---> Partners */}
      <section className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8 w-full">
        {/* Siblings (Left Column) */}
        <div className="flex flex-col items-center lg:items-end gap-3 flex-1" aria-label="Siblings">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Siblings
          </span>
          <div className="flex flex-col gap-3 items-center lg:items-end">
            {data.siblings.map((sibling) => (
              <PersonCard
                key={sibling.id}
                person={sibling}
                onClick={() => onSelectPerson(sibling.id)}
                onEdit={onEditPerson}
              />
            ))}
            <button
              type="button"
              onClick={() => onAddRelative('sibling')}
              className="min-h-[48px] px-4 py-2 border border-dashed border-slate-300 hover:border-slate-500 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
              aria-label="+ Add Sibling"
            >
              <span className="text-base font-bold" aria-hidden="true">+</span>
              <span>Add Sibling</span>
            </button>
          </div>
        </div>

        {/* Focus Person (Center) */}
        <div className="flex flex-col items-center justify-center my-auto px-2" aria-label="Focus Person">
          <span className="text-xs font-extrabold uppercase tracking-widest text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-300 mb-2">
            Focus Person
          </span>
          <PersonCard person={data.focus_person} isFocus={true} onEdit={onEditPerson} />
        </div>

        {/* Spouse / Partner (Right Column) */}
        <div className="flex flex-col items-center lg:items-start gap-3 flex-1" aria-label="Spouse and Partners">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Spouse / Partner
          </span>
          <div className="flex flex-col gap-3 items-center lg:items-start">
            {data.partners.map((partner) => (
              <PersonCard
                key={partner.id}
                person={partner}
                onClick={() => onSelectPerson(partner.id)}
                onEdit={onEditPerson}
              />
            ))}
            <button
              type="button"
              onClick={() => onAddRelative('partner')}
              className="min-h-[48px] px-4 py-2 border border-dashed border-slate-300 hover:border-slate-500 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
              aria-label="+ Add Partner"
            >
              <span className="text-base font-bold" aria-hidden="true">+</span>
              <span>Add Partner</span>
            </button>
          </div>
        </div>
      </section>

      {/* Children Section (Bottom) */}
      <section className="flex flex-col items-center gap-3 w-full" aria-label="Children">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
          Children
        </span>
        <div className="flex gap-4 flex-wrap justify-center items-center">
          {data.children.map((child) => (
            <PersonCard
              key={child.id}
              person={child}
              onClick={() => onSelectPerson(child.id)}
              onEdit={onEditPerson}
            />
          ))}
          <button
            type="button"
            onClick={() => onAddRelative('child')}
            className="min-h-[52px] px-5 py-3 border-2 border-dashed border-slate-300 hover:border-slate-500 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 font-semibold text-sm transition-colors flex items-center gap-2 cursor-pointer"
            aria-label="+ Add Child"
          >
            <span className="text-lg font-bold" aria-hidden="true">+</span>
            <span>Add Child</span>
          </button>
        </div>
      </section>
    </div>
  );
};
