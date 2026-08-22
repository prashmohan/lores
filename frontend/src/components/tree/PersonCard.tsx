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

  const baseClasses = `relative p-4 rounded-xl text-left transition-all border-2 w-56 sm:w-60 shadow-sm ${
    isFocus
      ? 'bg-amber-50 border-amber-500 ring-4 ring-amber-200 shadow-md'
      : isClickable
      ? 'bg-white border-slate-300 hover:border-slate-500 hover:shadow-md'
      : 'bg-white border-slate-300'
  } ${className}`;

  const nameClasses = `font-bold leading-tight tracking-tight ${
    isFocus ? 'text-2xl text-slate-950 font-extrabold' : 'text-lg text-slate-900'
  }`;

  const dateClasses = `mt-1 font-medium ${
    isFocus ? 'text-base text-slate-700' : 'text-sm text-slate-600'
  }`;

  return (
    <div className={baseClasses}>
      <div className="flex items-start justify-between gap-1 mb-1">
        {person.relationship_label ? (
          <span className="text-xs uppercase font-bold tracking-wider text-slate-600 block">
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
            className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-200/80 transition-colors cursor-pointer"
            aria-label={`Edit details for ${fullName}`}
            title="Edit Details"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {isClickable ? (
        <button
          type="button"
          onClick={onClick}
          className="w-full text-left cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md group"
          aria-label={`${person.relationship_label ? `${person.relationship_label}: ` : ''}${fullName}, ${dateText}`}
        >
          <h3 className={`${nameClasses} group-hover:text-amber-900 transition-colors`}>{fullName}</h3>
          <p className={dateClasses}>{dateText}</p>
          {person.birth_place && (
            <p className="text-xs text-slate-500 mt-0.5 truncate" title={person.birth_place}>
              📍 {person.birth_place}
            </p>
          )}
        </button>
      ) : (
        <div>
          <h3 className={nameClasses}>{fullName}</h3>
          <p className={dateClasses}>{dateText}</p>
          {person.birth_place && (
            <p className="text-xs text-slate-500 mt-0.5 truncate" title={person.birth_place}>
              📍 {person.birth_place}
            </p>
          )}
        </div>
      )}

      {isFocus && onEdit && (
        <button
          type="button"
          onClick={() => onEdit(person)}
          className="mt-3 w-full py-1.5 px-3 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-amber-400/50"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>Edit Details</span>
        </button>
      )}
    </div>
  );
};
