import React from 'react';
import type { PersonSummary } from '../../types/api';

export type Person = PersonSummary;

interface PersonCardProps {
  person: PersonSummary;
  isFocus?: boolean;
  onClick?: () => void;
  className?: string;
}

export const PersonCard: React.FC<PersonCardProps> = ({
  person,
  isFocus = false,
  onClick,
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

  const content = (
    <>
      {person.relationship_label && (
        <span className="text-xs uppercase font-bold tracking-wider text-slate-600 block mb-1">
          {person.relationship_label}
        </span>
      )}
      <h3
        className={`font-bold leading-tight tracking-tight ${
          isFocus ? 'text-2xl text-slate-950 font-extrabold' : 'text-lg text-slate-900'
        }`}
      >
        {fullName}
      </h3>
      <p className={`mt-1 font-medium ${isFocus ? 'text-base text-slate-700' : 'text-sm text-slate-600'}`}>
        {dateText}
      </p>
      {person.birth_place && (
        <p className="text-xs text-slate-500 mt-0.5 truncate" title={person.birth_place}>
          📍 {person.birth_place}
        </p>
      )}
    </>
  );

  const baseClasses = `p-4 rounded-xl text-left transition-all border-2 w-56 sm:w-60 shadow-sm ${
    isFocus
      ? 'bg-amber-50 border-amber-500 ring-4 ring-amber-200 shadow-md'
      : isClickable
      ? 'bg-white border-slate-300 hover:border-slate-500 hover:shadow-md cursor-pointer active:scale-98'
      : 'bg-white border-slate-300'
  } ${className}`;

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={baseClasses}
        aria-label={`${person.relationship_label ? `${person.relationship_label}: ` : ''}${fullName}, ${dateText}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={baseClasses}
      aria-label={`${person.relationship_label ? `${person.relationship_label}: ` : ''}${fullName}, ${dateText}`}
    >
      {content}
    </div>
  );
};
