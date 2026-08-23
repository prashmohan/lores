import React from 'react';
import { Pencil } from 'lucide-react';
import type { PersonSummary } from '../../types/api';

export type Person = PersonSummary;

interface PersonCardProps {
  person: PersonSummary;
  isFocus?: boolean;
  onClick?: () => void;
  onEdit?: (person: PersonSummary) => void;
  className?: string;
}

export const PersonCard: React.FC<PersonCardProps> = ({
  person,
  isFocus = false,
  onClick,
  onEdit,
  className = '',
}) => {
  const isClickable = !!onClick;
  const fullName = `${person.first_name} ${person.last_name}${
    person.maiden_name ? ` (née ${person.maiden_name})` : ''
  }`;

  const dateText = (() => {
    if (person.birth_date && person.death_date) {
      return `${person.birth_date} — ${person.death_date}`;
    }
    if (person.birth_date) {
      return person.is_living ? `b. ${person.birth_date}` : `${person.birth_date} — ?`;
    }
    if (person.death_date) {
      return `d. ${person.death_date}`;
    }
    return person.is_living ? 'Living' : 'Dates unknown';
  })();

  const initials = `${person.first_name?.[0] || ''}${person.last_name?.[0] || ''}`.toUpperCase();

  const baseClasses = `relative p-4 rounded-2xl text-left transition-all border-2 w-56 sm:w-64 shadow-xs ${
    isFocus
      ? 'bg-amber-50/90 border-amber-500 ring-4 ring-amber-200/80 shadow-md'
      : isClickable
      ? 'bg-white border-slate-200 hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5'
      : 'bg-white border-slate-200'
  } ${className}`;

  const nameClasses = `font-extrabold leading-tight tracking-tight break-words ${
    isFocus ? 'text-2xl text-slate-950 font-black' : 'text-lg text-slate-900'
  }`;

  const dateClasses = `mt-1 font-semibold ${
    isFocus ? 'text-sm text-amber-900' : 'text-xs text-slate-600'
  }`;

  return (
    <div className={baseClasses}>
      <div className="flex items-start justify-between gap-1 mb-2">
        {person.relationship_label ? (
          <span className="text-[11px] uppercase font-black tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md block">
            {person.relationship_label}
          </span>
        ) : (
          <span />
        )}
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(person);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label={`Edit details for ${fullName}`}
            title="Edit Details"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isClickable ? (
        <button
          type="button"
          onClick={onClick}
          className="w-full text-left cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xl group flex items-start gap-3"
          aria-label={`${person.relationship_label ? `${person.relationship_label}: ` : ''}${fullName}, ${dateText}`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border ${
              isFocus
                ? 'bg-amber-500 text-slate-950 border-amber-600'
                : 'bg-slate-100 text-slate-700 border-slate-200 group-hover:bg-amber-100 group-hover:text-amber-900 group-hover:border-amber-300'
            } transition-colors`}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={`${nameClasses} group-hover:text-amber-900 transition-colors`}>{fullName}</h3>
            <p className={dateClasses}>{dateText}</p>
            {person.birth_place && (
              <p className="text-xs text-slate-500 mt-0.5 truncate font-medium" title={person.birth_place}>
                📍 {person.birth_place}
              </p>
            )}
          </div>
        </button>
      ) : (
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border ${
              isFocus
                ? 'bg-amber-500 text-slate-950 border-amber-600'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={nameClasses}>{fullName}</h3>
            <p className={dateClasses}>{dateText}</p>
            {person.birth_place && (
              <p className="text-xs text-slate-500 mt-0.5 truncate font-medium" title={person.birth_place}>
                📍 {person.birth_place}
              </p>
            )}
          </div>
        </div>
      )}

      {isFocus && onEdit && (
        <button
          type="button"
          onClick={() => onEdit(person)}
          className="mt-3 w-full py-2 px-3 rounded-xl bg-amber-200/90 hover:bg-amber-300 active:bg-amber-400 text-amber-950 font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-amber-400/60 shadow-2xs"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>Edit Details</span>
        </button>
      )}
    </div>
  );
};
